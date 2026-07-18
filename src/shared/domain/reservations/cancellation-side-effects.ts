/**
 * 予約キャンセル後の副作用を統一的に実行する。
 *
 * 会員（マイページ）/ ゲスト（メールリンク）/ 管理者（管理画面）の全キャンセル経路が
 * 同じ副作用チェーンを通ることを保証する SSoT。
 *
 * ## CRITIC-6 fix: 副作用 outcome を AuditLog に構造化記録する
 *
 * 以前は各副作用（refund / GCal / メール / notification / SmartLock）を個別に
 * `fireAndForget` で束ねていたため、Resend suppression / GCal 429 / SwitchBot
 * 通信失敗などが silent no-op で握りつぶされ、mypage UI は「キャンセル完了」を
 * 表示するのに顧客側は確認メールを受け取っていない状態になり、サポートチケットの
 * 典型的な発生経路が観測不能だった。
 *
 * 現在は次の構造にしてある:
 *   1. 各副作用を run*Step ヘルパーに分離し、内部で await + try/catch して
 *      `CancellationEffectOutcome`（`status: "ok" | "skipped" | "error"`）を返す。
 *      個別 error は従来通り `logError` に詳細（category / severity / context）を残す
 *      （観測用 Cloud Logging と AuditLog の 2 系統に流す）。
 *   2. 全副作用の outcome を単一の AuditLog metadata `sideEffects` に集約して
 *      1 レコード書く。運用は AuditLog 1 件で「refund は sent / 顧客メールは
 *      Resend suppression で skipped」といった発行結果を辿れる。
 *   3. mypage レスポンス latency を維持するため、`applyCancellationSideEffects`
 *      本体では reservation fetch のみ await し、副作用チェーン全体を
 *      `fireAndForget` で `after()` に委譲する。以前の各副作用個別の
 *      fireAndForget と同じレスポンスタイム特性を保つ。
 *
 * 含まれる副作用:
 *   1. Stripe refund（`paymentStatus === PAID` / `PARTIALLY_REFUNDED` のときのみ発火）
 *   2. Google Calendar 同期イベント削除（`googleCalendarEventId` があるときのみ）
 *   3. 顧客向けキャンセル確認メール（CANCEL ICS 添付）
 *   4. 管理者向け管理者通知メール
 *   5. 管理者向け in-app 通知（reason 含む）
 *   6. AuditLog 書き込み（actor / channel / IP / UA + sideEffects outcomes）
 *   7. SwitchBot スマートロックの発行済みパスコード失効
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
  type RefundPolicy,
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
  EmailResult,
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
  /**
   * PERF-02: 呼出側が `Settings.refundPolicy` を事前に取得済ならその snapshot を渡す。
   * bulk cancel 経路 (`applyBulkCancellationSideEffects`) が per-instance の
   * Settings.findUnique N+1 を避けるために hoist して渡す。
   *
   * - 省略 (undefined) → 従前どおり per-call で Settings.findUnique を実行
   * - `RefundPolicy` → その snapshot を使用 (bulk 経路の hoist 値)
   * - `null` → 「policy 未設定 = 残額全額」を明示 (parseRefundPolicy が返す null を snapshot 化)
   */
  refundPolicySnapshot?: RefundPolicy | null;
}

// -----------------------------------------------------------------------------
// CRITIC-6: 副作用 outcome 型と集約 metadata 形式
// -----------------------------------------------------------------------------

/** 単一副作用の実行結果。AuditLog metadata と in-code のフロー分岐に共通で使う。 */
export type CancellationEffectOutcome = {
  /**
   * - `"ok"` — 副作用が実際に外部へ反映された（メール送信受理 / GCal 削除 / DB 書込成功）
   * - `"skipped"` — 意図的に発火しなかった（対象データ無し / suppress flag / feature 無効 /
   *   Resend suppression list / policy=0% など）
   * - `"error"` — 発火したが失敗した（外部 API エラー / DB エラー / 予期せぬ throw）
   */
  status: "ok" | "skipped" | "error";
  /** skipped / error の場合の理由（machine-readable enum-like 文字列を優先）。 */
  reason?: string;
  /** amount / messageId / durationMs 等の副次情報（AuditLog に直接乗せる）。 */
  detail?: Record<string, string | number | boolean | null>;
};

/** 全副作用の outcome を並べた集約構造。AuditLog metadata.sideEffects に格納される。 */
export type CancellationSideEffectOutcomes = {
  refund: CancellationEffectOutcome;
  gcal: CancellationEffectOutcome;
  customerEmail: CancellationEffectOutcome;
  adminEmail: CancellationEffectOutcome;
  notification: CancellationEffectOutcome;
  smartLock: CancellationEffectOutcome;
};

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

// -----------------------------------------------------------------------------
// 個別副作用ヘルパー: 実行 + outcome capture。throw しない (orchestrator 保護)。
// -----------------------------------------------------------------------------

function mapEmailResultToOutcome(
  result: EmailResult,
): CancellationEffectOutcome {
  if (result.ok) {
    return { status: "ok", detail: { messageId: result.messageId } };
  }
  if (result.reason === "disabled") {
    return { status: "skipped", reason: "disabled_or_suppressed" };
  }
  return { status: "error", reason: result.error };
}

async function runRefundStep(args: {
  input: CancellationSideEffectInput;
  reservation: SideEffectReservation;
  requiresRefund: boolean;
  wasPaid: boolean;
}): Promise<CancellationEffectOutcome> {
  const { input, reservation, requiresRefund, wasPaid } = args;

  if (!requiresRefund) {
    return {
      status: "skipped",
      reason: wasPaid ? "noPaymentIntent" : "notPaid",
    };
  }

  try {
    // PERF-02: bulk 経路が snapshot を渡してきたらそれを使う (N+1 回避)。
    // 単発 caller は snapshot 未指定 → per-call で Settings.findUnique (従前挙動)。
    const policy: RefundPolicy | null =
      input.refundPolicySnapshot !== undefined
        ? input.refundPolicySnapshot
        : parseRefundPolicy(
            (
              await prisma.settings.findUnique({
                where: { id: "singleton" },
                select: { refundPolicy: true },
              })
            )?.refundPolicy,
          );

    let refundAmount: number | undefined;
    if (policy !== null && reservation.totalPrice !== null) {
      refundAmount = calculateRefundAmount(
        policy,
        Number(reservation.totalPrice),
        reservation.startTime,
        new Date(),
      );
    }

    if (refundAmount !== undefined && refundAmount <= 0) {
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
      return { status: "skipped", reason: "policyRefundRateZero" };
    }

    const result = await refundReservationPaymentCommand({
      reservationId: input.reservationId,
      actorType: REFUNDED_BY_TYPE.AUTO_ON_CANCEL,
      // UA-HORIZ-04: 起点のキャンセル request context (ip / userAgent) を継承し、
      // AUTO_ON_CANCEL 経由の refund AuditLog にも forensic ヘッダーを載せる。
      request: {
        ip: input.request.ip,
        userAgent: input.request.userAgent,
      },
      ...(refundAmount !== undefined ? { amount: refundAmount } : {}),
    });
    return {
      status: "ok",
      detail: {
        refundAmount: result.refundAmount,
        cumulativeAmount: result.cumulativeAmount,
        newPaymentStatus: result.newPaymentStatus,
      },
    };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "autoRefundOnCancel",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

async function runGcalStep(args: {
  input: CancellationSideEffectInput;
  reservation: SideEffectReservation;
}): Promise<CancellationEffectOutcome> {
  const { input, reservation } = args;
  if (input.suppress?.gcalDelete) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  if (!reservation.googleCalendarEventId) {
    return { status: "skipped", reason: "noEventId" };
  }
  try {
    const result = await deleteCalendarSync(
      input.reservationId,
      reservation.googleCalendarEventId,
    );
    if (result.success) {
      return { status: "ok" };
    }
    logError(new Error(`deleteCalendarSync failed: ${result.error}`), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "deleteCalendarSync",
        reservationId: input.reservationId,
      },
    });
    return { status: "error", reason: result.error };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "deleteCalendarSync",
        reservationId: input.reservationId,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

async function runCustomerEmailStep(args: {
  input: CancellationSideEffectInput;
  payload: ReservationEmailData;
}): Promise<CancellationEffectOutcome> {
  const { input, payload } = args;
  if (input.suppress?.customerEmail) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  try {
    const result = await sendReservationCancelledEmail(payload);
    return mapEmailResultToOutcome(result);
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendCancellationEmails",
        reservationId: input.reservationId,
        channel: input.channel,
        recipient: "customer",
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

async function runAdminEmailStep(args: {
  input: CancellationSideEffectInput;
  payload: ReservationEmailData;
}): Promise<CancellationEffectOutcome> {
  const { input, payload } = args;
  if (input.suppress?.adminEmail) {
    return { status: "skipped", reason: "suppressed_by_bulk" };
  }
  try {
    const result = await sendReservationAdminNotification(payload, "cancel");
    return mapEmailResultToOutcome(result);
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "sendCancellationEmails",
        reservationId: input.reservationId,
        channel: input.channel,
        recipient: "admin",
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

async function runNotificationStep(args: {
  input: CancellationSideEffectInput;
  requiresRefund: boolean;
}): Promise<CancellationEffectOutcome> {
  const { input, requiresRefund } = args;
  const notificationTitle = requiresRefund
    ? "PAID 予約のキャンセル — 要返金確認"
    : `予約キャンセル（${channelLabel(input.channel)}）`;
  const notificationMessage = input.cancellationReason
    ? `理由: ${input.cancellationReason}`
    : "理由: 入力なし";

  try {
    await createNotificationCommand({
      type: NOTIFICATION_TYPE.RESERVATION_CANCEL,
      title: notificationTitle,
      message: notificationMessage,
      resourceType: "reservation",
      resourceId: input.reservationId,
    });
    return { status: "ok" };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "createCancellationNotification",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

async function runSmartLockStep(
  input: CancellationSideEffectInput,
): Promise<CancellationEffectOutcome> {
  try {
    await revokeSmartLockPasscodesForReservation(input.reservationId);
    return { status: "ok" };
  } catch (err) {
    const normalized = normalizeError(err);
    logError(normalized, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "revokeSmartLockPasscodesOnCancel",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
    return { status: "error", reason: normalized.message };
  }
}

/**
 * 副作用チェーンの本体。全 sub-effect を並列実行し、outcome を集約 AuditLog に書く。
 * 個別 sub-effect の失敗は run*Step 内で完結し、throw をここまで伝播させない。
 * `applyCancellationSideEffects` から `fireAndForget` 越しに `after()` 内で実行される。
 */
async function runCancellationSideEffectsAndFlushAudit(args: {
  input: CancellationSideEffectInput;
  reservation: SideEffectReservation;
  payload: ReservationEmailData;
  wasPaid: boolean;
  requiresRefund: boolean;
}): Promise<void> {
  const { input, reservation, payload, wasPaid, requiresRefund } = args;

  // 副作用は互いに独立。並列で発火し、それぞれ独立に outcome 化する。
  const [refund, gcal, customerEmail, adminEmail, notification, smartLock] =
    await Promise.all([
      runRefundStep({ input, reservation, requiresRefund, wasPaid }),
      runGcalStep({ input, reservation }),
      runCustomerEmailStep({ input, payload }),
      runAdminEmailStep({ input, payload }),
      runNotificationStep({ input, requiresRefund }),
      runSmartLockStep(input),
    ]);

  const outcomes: CancellationSideEffectOutcomes = {
    refund,
    gcal,
    customerEmail,
    adminEmail,
    notification,
    smartLock,
  };

  try {
    await createAuditLogRecord({
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
        sideEffects: outcomes,
      },
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "auditLogCancellation",
        reservationId: input.reservationId,
        channel: input.channel,
      },
    });
  }
}

/**
 * キャンセル後の副作用統一実行。
 *
 * reservation fetch 以外は `fireAndForget` で `after()` に委譲するため、
 * 呼び出し側の response latency は fetch 時間のみ（従来と同じ）。
 * 全副作用の outcome は集約 AuditLog metadata (`sideEffects`) に記録され、
 * Resend suppression / GCal 429 / SwitchBot 通信失敗などが「完了表示 vs 実挙動」の
 * 乖離としてカスタマーサポート起点で観測可能になる（CRITIC-6）。
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

  fireAndForget(
    runCancellationSideEffectsAndFlushAudit({
      input,
      reservation,
      payload,
      wasPaid,
      requiresRefund,
    }),
    {
      operation: "applyCancellationSideEffects",
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        reservationId: input.reservationId,
        channel: input.channel,
      },
    },
  );
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
  /**
   * どこから / 誰がキャンセルしたか (per-instance 副作用の channel + 集約 AuditLog
   * metadata に伝播)。admin / customer 経由の両方から呼ばれるため input で受け取る
   * (Phase B.2.1 Task 4)。
   */
  channel: CancelChannel;
  cancellationReason?: string;
  actorUserId?: string;
  request: CancelRequestContext;
  now: Date;
  /**
   * `this-and-following` scope の GCal master RRULE UNTIL に渡す時刻。
   * 呼出側 (`cancelReservationSeriesCommand`) が `fromInstance.startTime - 1s`
   * を計算して渡す。省略時は後方互換のため `now` にフォールバックするが、
   * `this-and-following` 経路では必ず指定すること
   * (RECENT-01: 指定しないと `now < fromInstance.startTime` のケースで GCal master
   * RRULE が cancel 実行時刻で truncate され、DB では CONFIRMED のまま残る
   * 過去 instance が GCal 上から silent に消失する)。
   */
  gcalUntil?: Date;
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

  // PERF-02: Settings.refundPolicy を bulk 開始時に 1 回だけ fetch し per-instance
  // に snapshot として渡す。refund policy は series 一括キャンセル中 (数十秒スケール)
  // で変化しないビジネスセマンティクスであり、per-instance の Settings.findUnique
  // 呼び出しは Cloud Run→Neon RTT を N-1 回積み上げる無駄なラウンドトリップだった
  // (52 instance で ~500ms-1.5s の空 latency)。Step 1 前段の 1 fetch にまとめる。
  //
  // fetch 成功時: RefundPolicy | null (null = 「policy 未設定 = 残額全額返金」を明示)。
  // fetch 失敗時: undefined のまま catch を抜け、受け手 (applyCancellationSideEffects)
  //   の `!== undefined` 判定で per-instance の再 fetch にフォールバックさせる。
  //   ここで null を残すと「全額返金」として受け取られ、Stripe 全額返金を招く
  //   （PERF-02-FIX、audit 2026-07-18）。
  let refundPolicySnapshot: RefundPolicy | null | undefined = undefined;
  try {
    const settings = await prisma.settings.findUnique({
      where: { id: "singleton" },
      select: { refundPolicy: true },
    });
    refundPolicySnapshot = parseRefundPolicy(settings?.refundPolicy);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "applyBulkCancellationSideEffects.settingsSnapshot",
        seriesId: input.seriesId,
      },
    });
    // refundPolicySnapshot は undefined のまま。以降の呼出しで conditional spread
    // により受け手側に refundPolicySnapshot キー自体を渡さず、per-instance の
    // Settings.findUnique 再 fetch を発動させる。
  }

  // Step 1: per-instance 副作用（customerEmail / adminEmail / gcalDelete のみ suppress）
  for (const reservationId of input.reservationIds) {
    try {
      await applyCancellationSideEffects({
        reservationId,
        cancellationReason,
        channel: input.channel,
        actorUserId,
        request: input.request,
        suppress: {
          customerEmail: true,
          adminEmail: true,
          gcalDelete: true,
        },
        // exactOptionalPropertyTypes: undefined を明示代入せず conditional spread。
        ...(refundPolicySnapshot !== undefined ? { refundPolicySnapshot } : {}),
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
        // Phase B.2.1 Task C: RRULE 再構築 + events.patch で UNTIL 注入 (実装済)。
        // UNTIL は fromInstance.startTime - 1s (呼出側計算) を優先し、後方互換の
        // ため未指定時のみ `input.now` にフォールバック。詳細は RECENT-01 fix
        // (BulkCancellationSideEffectInput.gcalUntil の JSDoc)。
        await patchGcalMasterUntil({
          masterEventId,
          seriesId: input.seriesId,
          until: input.gcalUntil ?? input.now,
        });
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
        channel: input.channel,
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
