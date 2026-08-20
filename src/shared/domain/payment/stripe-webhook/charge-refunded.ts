import "server-only";

import type Stripe from "stripe";
import {
  findReservationByPaymentIntent,
  applyChargeRefundIdempotent,
} from "@/shared/domain/reservations/payment-queries";
import {
  findEventRegistrationByPaymentIntent,
  applyEventChargeRefundIdempotent,
} from "@/shared/domain/events/payment-queries";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  invalidateEventRegistrationCache,
  invalidateReservationCache,
} from "./cache-invalidation";
import { pickLatestChargeRefund } from "./latest-charge-refund";

/**
 * charge.refunded
 *
 * 返金完了。stripePaymentIntentId で予約を検索し、charge の amount / amount_refunded で
 * partial / full を判定して paymentStatus を遷移する。Refund child は idempotent write。
 *
 * Codex P1 (PR #1125, comment 3588489513) 対応: 旧実装は unconditional REFUNDED flip で、
 * `refundReservationPaymentCommand` が設定した PARTIALLY_REFUNDED を上書きしていた。
 */
export async function handleChargeRefunded(
  charge: Stripe.Charge,
): Promise<void> {
  const paymentIntentId =
    typeof charge.payment_intent === "string" ? charge.payment_intent : null;

  if (!paymentIntentId) {
    logError(new Error("Missing payment_intent on charge.refunded event"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "stripeWebhookChargeRefunded",
        chargeId: charge.id,
      },
    });
    return;
  }

  // Stripe webhook payload の `charge.refunds` は default で最新 10 件 (docs:
  // GET /v1/refunds は most recent first)。順不同でも created 最大を取る。
  const latestRefundData = pickLatestChargeRefund(charge.refunds);
  const latestRefund = latestRefundData
    ? {
        id: latestRefundData.id,
        amount: latestRefundData.amount,
        // Stripe の実 status をそのまま運ぶ。ここで捨てると Refund 行が
        // 未確定の返金を "succeeded" として記録し、paymentStatus も終端へ
        // 焼かれて戻せなくなる（監査 F-54 / F-55）。
        status: latestRefundData.status,
        // metadata.initiator: app 側 refund path が仕込んだ RefundedByType を復元し
        // て、webhook 先着 race で attribution が "STRIPE_DASHBOARD" と mislabel
        // されるのを防ぐ。metadata が空 / 未知値なら fallback で STRIPE_DASHBOARD。
        metadata: latestRefundData.metadata,
      }
    : null;

  // 1. Reservation 経路をまず try
  const reservation = await findReservationByPaymentIntent(paymentIntentId);
  if (reservation) {
    await applyChargeRefundIdempotent({
      reservationId: reservation.id,
      chargeAmount: charge.amount,
      amountRefunded: charge.amount_refunded,
      currency: charge.currency,
      latestRefund,
    });
    invalidateReservationCache(reservation.id);
    return;
  }

  // 2. EventRegistration 経路 (task #6): Reservation で見つからなければ event 側を検索。
  const registration =
    await findEventRegistrationByPaymentIntent(paymentIntentId);
  if (registration) {
    await applyEventChargeRefundIdempotent({
      registrationId: registration.id,
      chargeAmount: charge.amount,
      amountRefunded: charge.amount_refunded,
      currency: charge.currency,
      latestRefund,
    });
    invalidateEventRegistrationCache();
    return;
  }

  logError(
    new Error(
      "No reservation or event registration found for payment_intent on charge.refunded",
    ),
    {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "stripeWebhookChargeRefunded",
        paymentIntentId,
      },
    },
  );
}
