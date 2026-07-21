"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCheckoutSessionCommand,
  refundReservationPaymentCommand,
  type RefundReservationResult,
} from "@/shared/domain/reservations/payment-commands";
import { fetchReservationEmailData } from "@/shared/domain/reservations/payloads";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/refund-attribution";
import { PaymentStatus } from "@/shared/lib/validations/enums/prisma-types";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import { sendReservationRefundEmail } from "@/shared/lib/email/reservation-emails";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";

export async function createCheckoutSession(
  reservationId: string,
): Promise<MutationResult<{ sessionId: string; sessionUrl: string | null }>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async () =>
      createCheckoutSessionCommand({ reservationId, actorCustomerId: null }),
    afterSuccess: (data) => {
      invalidateReservationCaches(reservationId, data.customerId);
    },
  });
}

/**
 * 管理者による返金 (task #9 PR#3 で command 拡張、task #9 PR#4 で UI で amount/reason 入力対応)。
 *
 * @param reservationId 対象予約 ID
 * @param options 部分返金 amount / 返金理由。両方省略で残額全額返金 + reason なし
 *
 * actorType=ADMIN で `refundReservationPaymentCommand` を呼び出す。amount 未指定 →
 * `Refund` 集計後の残額全額を返金 (PAID 予約なら totalPriceWithTax、PARTIALLY_REFUNDED
 * 予約なら totalPriceWithTax - Σ既 refunds)。actorUserId は Better Auth session の管理者 id。
 */
export async function refundReservationPayment(
  reservationId: string,
  options?: {
    /** 部分返金額 (円、正整数)。省略で残額全額。 */
    amount?: number;
    /** 返金理由 (Refund.reason + AuditLog metadata に記録)。 */
    reason?: string;
  },
): Promise<MutationResult<RefundReservationResult>> {
  return executeAdminMutationResult({
    resource: "reservation",
    action: "update",
    resourceId: reservationId,
    execute: async (user) => {
      // UA-HORIZ-04: admin session hijack シナリオでの forensics 対称化のため
      // ip / userAgent を AuditLog metadata に載せる (cancel / receipt / waitlist と同型)。
      const request = await buildAuditRequestContext();
      return refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: user.id,
        request,
        ...(options?.amount !== undefined ? { amount: options.amount } : {}),
        ...(options?.reason !== undefined && options.reason !== ""
          ? { reason: options.reason }
          : {}),
      });
    },
    afterSuccess: (data) => {
      invalidateReservationCaches(reservationId, data.customerId);

      // Cluster H #8: 顧客への返金通知メール + 管理者向け in-app 通知を発火する。
      // 返金は「更新」「キャンセル」と独立した重要取引通知として非 gate で常時送信。
      // idempotencyKey は refundId ベースなので複数回の部分返金でも silent drop しない。
      fireAndForget(
        (async () => {
          const emailData = await fetchReservationEmailData(reservationId);
          if (!emailData) return;
          await sendReservationRefundEmail({
            reservationId: emailData.reservationId,
            customerEmail: emailData.customerEmail,
            customerName: emailData.customerName,
            spaceName: emailData.spaceName,
            startTime: emailData.startTime,
            endTime: emailData.endTime,
            refundAmount: data.refundAmount,
            cumulativeRefundAmount: data.cumulativeAmount,
            // fetchReservationEmailData は最新の totalPrice を返すため、
            // manual admin edit 後の refund でも表示上の割合が現在値と一致する。
            originalTotal: emailData.totalPrice ?? 0,
            isFullyRefunded: data.newPaymentStatus === PaymentStatus.REFUNDED,
            refundId: data.refundId,
            ...(emailData.userId != null ? { userId: emailData.userId } : {}),
          });
        })(),
        {
          operation: "sendReservationRefundEmail",
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { reservationId, refundId: data.refundId },
        },
      );

      fireAndForget(
        createNotificationCommand({
          type: NOTIFICATION_TYPE.RESERVATION_REFUND,
          title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.RESERVATION_REFUND],
          message:
            data.newPaymentStatus === PaymentStatus.REFUNDED
              ? "管理者が予約の全額返金を実行しました"
              : "管理者が予約の一部返金を実行しました",
          resourceType: "reservation",
          resourceId: reservationId,
        }),
        {
          operation: "refundReservationPaymentNotification",
          category: ErrorCategory.DATABASE,
        },
      );
    },
  });
}
