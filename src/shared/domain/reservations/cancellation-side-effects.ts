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
import { fireAndForget } from "@/shared/lib/async-utils";
import { deleteCalendarSync } from "@/shared/lib/calendar-sync/outbound";
import {
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
import {
  CANCELLED_BY,
  NOTIFICATION_TYPE,
  type CancelledByType,
} from "@/shared/lib/validations/enums/helpers";
import { PaymentStatus, type ReservationStatus } from "@generated/prisma/enums";
import type { ReservationEmailData } from "@/shared/lib/email/types";

export type CancelChannel = "admin" | "customer-mypage" | "customer-token";

export interface CancellationSideEffectInput {
  reservationId: string;
  /** 既に DB に書き込まれた cancellation reason。in-app 通知 / 監査 metadata に流す。 */
  cancellationReason: string | null;
  /** どこから / 誰がキャンセルしたか。AuditLog metadata と通知タイトル分岐に使う。 */
  channel: CancelChannel;
  /** AuditLog.userId に書く。会員セルフキャンセル/管理者キャンセルでは値あり、ゲストでは null。 */
  actorUserId: string | null;
  /** リクエスト由来のコンテキスト（監査・フォレンジック用）。 */
  request: {
    ip: string | null;
    userAgent: string | null;
    /** ステートレストークン経路でのみ意味を持つ。SHA-256 の先頭 16 文字。 */
    tokenFingerprint?: string | null;
  };
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
  const wasPaid = reservation.paymentStatus === PaymentStatus.PAID;
  const requiresRefund = wasPaid && reservation.stripePaymentIntentId !== null;

  // 1. Stripe refund（PAID のみ自動・失敗は in-app 通知タイトルで要返金確認をフラグ）
  if (requiresRefund) {
    fireAndForget(
      refundReservationPaymentCommand(input.reservationId).then(() => {
        return;
      }),
      {
        operation: "autoRefundOnCancel",
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.HIGH,
        context: {
          reservationId: input.reservationId,
          channel: input.channel,
        },
      },
    );
  }

  // 2. GCal 同期イベント削除
  if (reservation.googleCalendarEventId) {
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
  fireAndForget(
    Promise.all([
      sendReservationCancelledEmail(payload),
      sendReservationAdminNotification(payload, "cancel"),
    ]),
    {
      operation: "sendCancellationEmails",
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        reservationId: input.reservationId,
        channel: input.channel,
      },
    },
  );

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
}
