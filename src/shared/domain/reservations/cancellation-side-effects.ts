/**
 * 予約キャンセル後の副作用を統一的に実行する。
 *
 * 会員（マイページ）/ ゲスト（メールリンク）/ 管理者（管理画面）の全キャンセル経路が
 * 同じ副作用チェーンを通ることを保証する SSoT。各副作用は `fireAndForget` 並列で
 * 投げ、個別失敗は `logError` で記録（メール送信失敗で監査ログが落ちる等の連鎖を避ける）。
 *
 * 含まれる副作用:
 *   1. Stripe refund（`paymentStatus === PAID` のときのみ自動発火）
 *   2. Google Calendar 同期イベント削除（`googleCalendarEventId` があるときのみ）
 *   3. 顧客向けキャンセル確認メール（CANCEL ICS 添付）
 *   4. 管理者向け管理者通知メール
 *   5. 管理者向け in-app 通知（reason 含む）
 *   6. AuditLog 書き込み（actor / channel / IP / UA を記録）
 *   7. SwitchBotスマートロックの発行済みパスコード失効（deleteKey、対象デバイス無し/
 *      未発行なら no-op。失敗分は cleanup cron がフォールバック回収する）
 *
 * 呼び出し条件:
 *   `applyCancellation` が `success: true` を返した後にだけ呼ぶ。本関数は予約データの
 *   再取得を行うため、cancel transaction commit 後に呼ぶこと（読み取り tx 外）。
 *
 * @module shared/domain/reservations/cancellation-side-effects
 */

import "server-only";

import { AuditAction } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import { refundReservationPaymentCommand } from "@/shared/domain/reservations/payment-commands";
import {
  calculateRefundAmount,
  parseRefundPolicy,
} from "@/shared/domain/refund/policy";
import { fireAndForget } from "@/shared/lib/async-utils";
import { deleteCalendarSync } from "@/shared/lib/calendar-sync/outbound";
import {
  deleteGcalMaster,
  getSeriesGcalMasterEventId,
  patchGcalMasterUntil,
} from "@/shared/lib/calendar-sync/series-outbound";
import {
  sendBulkAdminNotification,
  sendBulkReservationCancelledEmail,
  sendReservationAdminNotification,
  sendReservationCancelledEmail,
} from "@/shared/lib/email/reservation-emails";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";
import { revokeSmartLockPasscodesForReservation } from "@/shared/domain/smart-lock/revoke-passcode";
import {
  CANCELLED_BY,
  NOTIFICATION_TYPE,
  REFUNDED_BY_TYPE,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import { PaymentStatus, type ReservationStatus } from "@generated/prisma/enums";
import type {
  BulkReservationCancelledEmailData,
  ReservationEmailData,
} from "@/shared/lib/email/types";

export type CancelChannel = "admin" | "customer-mypage" | "customer-token";

/** リクエスト由来のコンテキスト（監査・フォレンジック用）。単発/bulk 両経路で共有する。 */
export interface CancelRequestContext {
  ip: string | null;
  userAgent: string | null;
  /** ステートレストークン経路でのみ意味を持つ。SHA-256 の先頭 16 文字。 */
  tokenFingerprint?: string | null;
}

/**
 * Phase B.2: bulk cancel 経路で per-instance の副作用を抑止するフラグ。
 *
 * `applyBulkCancellationSideEffects` が各 instance に対して `true` を渡すことで、
 * 個別メール（2N 通スパム）・個別 GCal delete を止め、series 単位の集約副作用
 * （1 回のみ）に一本化する（Codex fix 3599414659 / spec §4.5）。未指定
 * （`suppress` キー自体が無い）なら全フラグ falsy 相当となり、既存の単発
 * キャンセル経路は挙動変化なし。
 */
export type SideEffectSuppressFlags = {
  customerEmail?: boolean;
  adminEmail?: boolean;
  gcalDelete?: boolean;
};

export interface CancellationSideEffectInput {
  reservationId: string;
  /** 既に DB に書き込まれた cancellation reason。in-app 通知 / 監査 metadata に流す。 */
  cancellationReason: string | null;
  /** どこから / 誰がキャンセルしたか。AuditLog metadata と通知タイトル分岐に使う。 */
  channel: CancelChannel;
  /** AuditLog.userId に書く。会員セルフキャンセル/管理者キャンセルでは値あり、ゲストでは null。 */
  actorUserId: string | null;
  /** リクエスト由来のコンテキスト（監査・フォレンジック用）。 */
  request: CancelRequestContext;
  /** Phase B.2: bulk cancel 経路で per-instance の副作用を抑止する（既存 caller は未指定=従前挙動）。 */
  suppress?: SideEffectSuppressFlags;
}

const CHANNEL_TO_CANCELLED_BY: Record<CancelChannel, CancelledByType> = {
  admin: CANCELLED_BY.ADMIN,
  "customer-mypage": CANCELLED_BY.CUSTOMER_MYPAGE,
  "customer-token": CANCELLED_BY.CUSTOMER_TOKEN,
};

interface SideEffectReservation {
  id: string;
  startTime: Date;
  endTime: Date;
  totalPrice: number | null;
  notes: string | null;
  icsSequence: number;
  paymentStatus: PaymentStatus;
  stripePaymentIntentId: string | null;
  googleCalendarEventId: string | null;
  guestLastName: string | null;
  guestFirstName: string | null;
  guestEmail: string | null;
  customer: {
    lastName: string;
    firstName: string;
    companyName: string | null;
    email: string;
  };
  space: {
    name: string;
    addressDetail: string | null;
    location: { address: string };
  };
}

async function fetchReservationForSideEffects(
  reservationId: string,
): Promise<SideEffectReservation | null> {
  return prisma.reservation.findUnique({
    where: { id: reservationId },
    select: {
      id: true,
      startTime: true,
      endTime: true,
      totalPrice: true,
      notes: true,
      icsSequence: true,
      paymentStatus: true,
      stripePaymentIntentId: true,
      googleCalendarEventId: true,
      guestLastName: true,
      guestFirstName: true,
      guestEmail: true,
      customer: {
        select: {
          lastName: true,
          firstName: true,
          companyName: true,
          email: true,
        },
      },
      space: {
        select: {
          name: true,
          addressDetail: true,
          location: { select: { address: true } },
        },
      },
    },
  });
}

function buildEmailPayload(
  reservation: SideEffectReservation,
): ReservationEmailData {
  const guestFull =
    `${reservation.guestLastName ?? ""} ${reservation.guestFirstName ?? ""}`.trim();
  const customerFull =
    `${reservation.customer.lastName} ${reservation.customer.firstName}`.trim();
  const guestNameDiff =
    guestFull && guestFull !== customerFull ? guestFull : undefined;

  const notes = reservation.notes ?? undefined;
  const location = formatSpaceLineAddress(
    reservation.space.location.address,
    reservation.space.addressDetail,
  );

  return {
    reservationId: reservation.id,
    customerEmail: reservation.guestEmail ?? reservation.customer.email,
    customerName: customerFull || "お客様",
    companyName: reservation.customer.companyName,
    ...(guestNameDiff && { guestName: guestNameDiff }),
    spaceName: reservation.space.name,
    startTime: reservation.startTime,
    endTime: reservation.endTime,
    totalPrice: reservation.totalPrice,
    ...(notes !== undefined && { notes }),
    ...(location !== undefined && { location }),
    icsSequence: reservation.icsSequence,
  };
}

function channelLabel(channel: CancelChannel): string {
  switch (channel) {
    case "admin":
      return "管理者";
    case "customer-mypage":
      return "顧客（マイページ）";
    case "customer-token":
      return "顧客（メールリンク）";
  }
}

/**
 * キャンセル後の副作用統一実行。
 *
 * fireAndForget を集約することで、呼び出し側 action を読みやすく保ち、
 * 副作用 1 つの追加・除去が全経路に等しく反映されることを保証する。
 */
export async function applyCancellationSideEffects(
  input: CancellationSideEffectInput,
): Promise<void> {
  const reservation = await fetchReservationForSideEffects(input.reservationId);
  if (!reservation) {
    logError(
      new Error(
        `Cancellation side effects skipped: reservation ${input.reservationId} not found after cancel`,
      ),
      {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "applyCancellationSideEffects",
          reservationId: input.reservationId,
        },
      },
    );
    return;
  }

  const payload = buildEmailPayload(reservation);
  // PAID / PARTIALLY_REFUNDED (追加返金分が残っているケース) の両方をキャンセル時
  // auto-refund の対象とする。REFUNDED / UNPAID / PENDING / FAILED は対象外。
  const wasPaid =
    reservation.paymentStatus === PaymentStatus.PAID ||
    reservation.paymentStatus === PaymentStatus.PARTIALLY_REFUNDED;
  const requiresRefund = wasPaid && reservation.stripePaymentIntentId !== null;

  // 1. Stripe refund (task #9 PR#5)
  //   - actorType=AUTO_ON_CANCEL
  //   - Settings.refundPolicy が設定されていれば tier ベース計算で amount を決定
  //   - policy 未設定なら amount 未指定 (残額全額を返金、後方互換動作)
  //   - policy 適用結果が 0 円なら refund 全 skip (キャンセル自体は続行、in-app 通知の
  //     「要返金確認」タイトルは維持して運用側の判断を仰ぐ)
  if (requiresRefund) {
    const settings = await prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { refundPolicy: true },
    });
    const policy = parseRefundPolicy(settings?.refundPolicy);

    // policy 未設定 (null) → 残額全額返金 (現状の後方互換動作を維持)
    // policy 設定あり → tier 選定で amount 計算 (0 なら refund skip)
    let refundAmount: number | undefined;
    if (policy !== null && reservation.totalPrice !== null) {
      refundAmount = calculateRefundAmount(
        policy,
        Number(reservation.totalPrice),
        reservation.startTime,
        new Date(),
      );
    }

    if (refundAmount === undefined || refundAmount > 0) {
      fireAndForget(
        refundReservationPaymentCommand({
          reservationId: input.reservationId,
          actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
          ...(refundAmount !== undefined ? { amount: refundAmount } : {}),
        }).then(() => {
          return;
        }),
        {
          operation: "autoRefundOnCancel",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.HIGH,
          context: {
            reservationId: input.reservationId,
            channel: input.channel,
            ...(refundAmount !== undefined
              ? { policyRefundAmount: refundAmount }
              : {}),
          },
        },
      );
    } else {
      // Policy による refundRate=0% → 返金 skip。運用側の「要返金確認」通知タイトル
      // (下段の requiresRefund 分岐) はそのまま昇格させて、admin 側で手動対応を明示的に促す。
      logError(new Error("Auto refund skipped: policy refund rate is 0%"), {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: {
          operation: "autoRefundOnCancel",
          reservationId: input.reservationId,
          reason: "policyRefundRateZero",
        },
      });
    }
  }

  // 2. GCal 同期イベント削除（Phase B.2: suppress.gcalDelete で抑止。bulk 経路は
  //    series の master event に対する 1 回操作に一本化するため individual delete は不要）
  if (reservation.googleCalendarEventId && !input.suppress?.gcalDelete) {
    fireAndForget(
      deleteCalendarSync(
        input.reservationId,
        reservation.googleCalendarEventId,
      ),
      {
        operation: "deleteCalendarSync",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.LOW,
        context: { reservationId: input.reservationId },
      },
    );
  }

  // 3 & 4. 顧客向けキャンセル確認メール + 管理者通知メール
  // 個別にfireAndForgetする（Promise.allで束ねると片方の失敗でafter()の実行時間
  // 延長がもう片方の送信完了を待たずに解除されうる。詳細はasync-utils.tsのafter()コメント参照）。
  // Phase B.2: suppress.customerEmail / suppress.adminEmail で抑止（bulk 経路は集約
  // メール 1 通に一本化するため per-instance 送信は不要、2N 通スパム防止）。
  if (!input.suppress?.customerEmail) {
    fireAndForget(sendReservationCancelledEmail(payload), {
      operation: "sendCancellationEmails",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
  }
  if (!input.suppress?.adminEmail) {
    fireAndForget(sendReservationAdminNotification(payload, "cancel"), {
      operation: "sendCancellationEmails",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
  }

  // 5. 管理者向け in-app 通知（PAID 自動返金時は要確認タイトルへ昇格）
  const notificationTitle = requiresRefund
    ? "PAID 予約のキャンセル — 要返金確認"
    : `予約キャンセル（${channelLabel(input.channel)}）`;
  const notificationMessage = input.cancellationReason
    ? `理由: ${input.cancellationReason}`
    : "理由: 入力なし";

  fireAndForget(
    createNotificationCommand({
      type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
      title: notificationTitle,
      message: notificationMessage,
      resourceType: "reservation",
      resourceId: input.reservationId,
    }),
    {
      operation: "createCancellationNotification",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        reservationId: input.reservationId,
        channel: input.channel,
      },
    },
  );

  // 6. AuditLog 書き込み（actor + channel + IP + UA + token fingerprint）
  fireAndForget(
    createAuditLogRecord({
      ...(input.actorUserId ? { userId: input.actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "reservation",
      resourceId: input.reservationId,
      newValue: {
        status: "CANCELLED" satisfies ReservationStatus,
        cancelledByType: CHANNEL_TO_CANCELLED_BY[input.channel],
        cancellationReason: input.cancellationReason,
      },
      metadata: {
        channel: input.channel,
        ip: input.request.ip,
        userAgent: input.request.userAgent,
        ...(input.request.tokenFingerprint
          ? { tokenFingerprint: input.request.tokenFingerprint }
          : {}),
        requiresRefund,
        wasPaid,
      },
    }).catch((error: unknown) => {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.HIGH,
        context: {
          operation: "auditLogCancellation",
          reservationId: input.reservationId,
        },
      });
    }),
    {
      operation: "auditLogCancellation",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        reservationId: input.reservationId,
        channel: input.channel,
      },
    },
  );

  // 7. スマートロックパスコード失効
  fireAndForget(revokeSmartLockPasscodesForReservation(input.reservationId), {
    operation: "revokeSmartLockPasscodesOnCancel",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.MEDIUM,
    context: {
      reservationId: input.reservationId,
      channel: input.channel,
    },
  });
}

// =============================================================================
// Phase B.2: series 一括キャンセルの副作用（task 12）
// =============================================================================

export type BulkCancellationScope = "this-and-following" | "series-all";

export interface BulkCancellationSideEffectInput {
  /** `applyBulkCancellation`（cancel-core.ts）が確定させた claim 成功分の id 集合。 */
  reservationIds: string[];
  scope: BulkCancellationScope;
  seriesId: string;
  cancellationReason?: string;
  actorUserId?: string;
  request: CancelRequestContext;
  now: Date;
}

interface SeriesInfoForBulkEmail {
  customer: {
    lastName: string;
    firstName: string;
    email: string;
  };
  space: {
    name: string;
  };
}

async function fetchSeriesForBulkEmail(
  seriesId: string,
): Promise<SeriesInfoForBulkEmail | null> {
  return prisma.reservationSeries.findUnique({
    where: { id: seriesId },
    select: {
      customer: { select: { lastName: true, firstName: true, email: true } },
      space: { select: { name: true } },
    },
  });
}

async function fetchInstancesForBulkEmail(
  reservationIds: string[],
): Promise<{ startTime: Date; endTime: Date }[]> {
  if (reservationIds.length === 0) return [];
  return prisma.reservation.findMany({
    where: { id: { in: reservationIds } },
    select: { startTime: true, endTime: true },
    orderBy: { startTime: "asc" },
  });
}

/**
 * series 一括キャンセルの副作用統一実行（Phase B.2 task 12）。
 *
 * `applyBulkCancellation`（cancel-core.ts、DB claim のみ）が確定させた
 * cancelledIds を受けて、以下を順に実行する:
 *
 *   1. 各 instance に対して `applyCancellationSideEffects` を **for-await 順次**発火
 *      （`Promise.all` にすると AuditLog chain 用 advisory lock の争いで各 instance の
 *      finding/書込順序が保証されない）。Stripe refund / SwitchBot revoke /
 *      per-instance AuditLog / in-app 通知は通常どおり発火するが、customerEmail /
 *      adminEmail / gcalDelete は suppress して二重送信・個別 GCal delete を防ぐ
 *      （Codex fix 3599414659、per spec §4.5）
 *   2. series の master GCal イベントに対して scope 別の 1 回操作
 *      （`this-and-following` → UNTIL 更新、`series-all` → 削除。master event id
 *      取得は Task 16 で本実装に差し替わる stub — 現状は常に null を返し no-op skip）
 *   3. 集約キャンセルメール（顧客向け 1 通 + 管理者向け 1 通）
 *   4. 集約 AuditLog（resource: "reservation_series"）を 1 レコード
 *
 * 副作用のみを担当するため戻り値は無い。各ステップは独立に try/catch し、
 * 失敗は `logError` に吸収して例外を外へ伝播させない（1 ステップの失敗が他の
 * ステップの実行を妨げない。呼び出し側からは fire-and-forget 相当に扱える）。
 */
export async function applyBulkCancellationSideEffects(
  input: BulkCancellationSideEffectInput,
): Promise<void> {
  const cancellationReason = input.cancellationReason ?? null;
  const actorUserId = input.actorUserId ?? null;

  // Step 1: per-instance 副作用（customerEmail / adminEmail / gcalDelete のみ suppress）
  for (const reservationId of input.reservationIds) {
    try {
      await applyCancellationSideEffects({
        reservationId,
        cancellationReason,
        channel: "admin",
        actorUserId,
        request: input.request,
        suppress: {
          customerEmail: true,
          adminEmail: true,
          gcalDelete: true,
        },
      });
    } catch (error) {
      logError(normalizeError(error), {
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "applyBulkCancellationSideEffects.perInstance",
          reservationId,
          seriesId: input.seriesId,
        },
      });
    }
  }

  // Step 2: master GCal 操作（scope 分岐）
  try {
    const masterEventId = await getSeriesGcalMasterEventId(input.seriesId);
    if (masterEventId) {
      if (input.scope === "this-and-following") {
        await patchGcalMasterUntil(masterEventId, input.now);
      } else {
        await deleteGcalMaster(masterEventId);
      }
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "applyBulkCancellationSideEffects.gcalMaster",
        seriesId: input.seriesId,
        scope: input.scope,
      },
    });
  }

  // Step 3: 集約メール（顧客 + 管理者 各 1 通）
  try {
    const series = await fetchSeriesForBulkEmail(input.seriesId);
    if (!series) {
      logError(
        new Error(
          `Bulk cancellation aggregate email skipped: series ${input.seriesId} not found`,
        ),
        {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "applyBulkCancellationSideEffects.email",
            seriesId: input.seriesId,
          },
        },
      );
    } else {
      const instances = await fetchInstancesForBulkEmail(input.reservationIds);
      const emailData: BulkReservationCancelledEmailData = {
        seriesId: input.seriesId,
        customerEmail: series.customer.email,
        customerName:
          `${series.customer.lastName} ${series.customer.firstName}`.trim(),
        spaceName: series.space.name,
        instances,
        ...(input.cancellationReason
          ? { reason: input.cancellationReason }
          : {}),
      };

      await sendBulkReservationCancelledEmail(emailData);
      await sendBulkAdminNotification(emailData);
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "applyBulkCancellationSideEffects.email",
        seriesId: input.seriesId,
      },
    });
  }

  // Step 4: 集約 AuditLog（1 レコード、resource="reservation_series"）
  try {
    await createAuditLogRecord({
      ...(actorUserId ? { userId: actorUserId } : {}),
      action: AuditAction.UPDATE,
      resource: "reservation_series",
      resourceId: input.seriesId,
      newValue: {
        status: "CANCELLED" satisfies ReservationStatus,
        scope: input.scope,
        cancelledIds: input.reservationIds,
        cancellationReason,
      },
      metadata: {
        channel: "admin",
        ip: input.request.ip,
        userAgent: input.request.userAgent,
        ...(input.request.tokenFingerprint
          ? { tokenFingerprint: input.request.tokenFingerprint }
          : {}),
      },
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "applyBulkCancellationSideEffects.auditLog",
        seriesId: input.seriesId,
        scope: input.scope,
      },
    });
  }
}
