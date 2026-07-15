"use server";

import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { invalidateReservationCaches } from "@/shared/lib/cache/reservation-cache";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createCheckoutSessionCommand,
  refundReservationPaymentCommand,
  type RefundReservationResult,
} from "@/shared/domain/reservations/payment-commands";
import { REFUNDED_BY_TYPE } from "@/shared/lib/validations/enums/helpers";

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
      return refundReservationPaymentCommand({
        reservationId,
        actorType: REFUNDED_BY_TYPE.ADMIN,
        actorUserId: user.id,
        ...(options?.amount !== undefined ? { amount: options.amount } : {}),
        ...(options?.reason !== undefined && options.reason !== ""
          ? { reason: options.reason }
          : {}),
      });
    },
    afterSuccess: (data) => {
      invalidateReservationCaches(reservationId, data.customerId);
    },
  });
}
