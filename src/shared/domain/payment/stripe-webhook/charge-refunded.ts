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

  // Stripe webhook payload の `charge.refunds` は default で 10 件まで含まれる (docs 参照)。
  // 通常は 1 event = 1 新規 refund。data[0] が最新 (Stripe の list は desc order)。
  const latestRefundData = charge.refunds?.data[0];
  const latestRefund = latestRefundData
    ? {
        id: latestRefundData.id,
        amount: latestRefundData.amount,
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
