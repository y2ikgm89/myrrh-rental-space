import "server-only";

import type Stripe from "stripe";
import {
  savePaymentIntentId,
  getReservationCheckoutExpectedAmount,
} from "@/shared/domain/reservations/payment-queries";
import {
  saveEventRegistrationPaymentIntentId,
  getEventRegistrationCheckoutExpectedAmount,
} from "@/shared/domain/events/payment-queries";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import {
  checkoutSessionAmountMatchesExpected,
  extractPaymentSubject,
  orchestrateCheckoutAmountMismatchRefund,
} from "./checkout-helpers";
import {
  invalidateEventRegistrationCache,
  invalidateReservationCache,
} from "./cache-invalidation";
import { fulfillEventRegistrationPaymentAtomically } from "./fulfill-event-registration-payment";
import { fulfillReservationPaymentAtomically } from "./fulfill-reservation-payment";

/**
 * checkout.session.completed
 *
 * Stripe 公式: session.payment_status を確認する。
 * - "paid": 即時決済（カード等）→ 即座に fulfill
 * - "unpaid": 非同期決済（銀行振込等）→ async_payment_succeeded を待つ
 *
 * @see https://docs.stripe.com/payments/checkout/fulfill-orders
 */
export async function handleCheckoutSessionCompleted(
  session: Stripe.Checkout.Session,
  stripeClient: AsyncOnlyStripe,
): Promise<void> {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookCheckoutCompleted",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    const { reservationId } = subject;
    if (session.payment_status === "paid") {
      const expectedAmount =
        await getReservationCheckoutExpectedAmount(reservationId);
      const amountOk = await checkoutSessionAmountMatchesExpected(
        session,
        expectedAmount,
        "stripeWebhookCheckoutCompleted",
        "reservationId",
        reservationId,
      );
      if (!amountOk) {
        await orchestrateCheckoutAmountMismatchRefund(
          session,
          subject,
          expectedAmount,
          "stripeWebhookCheckoutCompleted",
          stripeClient,
        );
        return;
      }

      // 即時決済（カード等）: atomic claim で fulfill
      await fulfillReservationPaymentAtomically(reservationId, session);
    } else {
      // 非同期決済（銀行振込等）: PaymentIntent ID のみ保存
      // paymentStatus は PENDING のまま維持。async_payment_succeeded で fulfill される
      const paymentIntentId =
        typeof session.payment_intent === "string"
          ? session.payment_intent
          : null;

      if (paymentIntentId) {
        await savePaymentIntentId(reservationId, paymentIntentId, session.id);
      }

      invalidateReservationCache(reservationId);
    }
    return;
  }

  const { registrationId } = subject;
  if (session.payment_status === "paid") {
    const expectedAmount =
      await getEventRegistrationCheckoutExpectedAmount(registrationId);
    const amountOk = await checkoutSessionAmountMatchesExpected(
      session,
      expectedAmount,
      "stripeWebhookCheckoutCompleted",
      "registrationId",
      registrationId,
    );
    if (!amountOk) {
      await orchestrateCheckoutAmountMismatchRefund(
        session,
        subject,
        expectedAmount,
        "stripeWebhookCheckoutCompleted",
        stripeClient,
      );
      return;
    }

    await fulfillEventRegistrationPaymentAtomically(
      registrationId,
      session,
      stripeClient,
    );
  } else {
    // 非同期決済（konbini / customer_balance）: PaymentIntent ID のみ保存。
    // 決済が実際に確定するのは後続の checkout.session.async_payment_succeeded
    // （`handleAsyncPaymentSucceeded` が `fulfillEventRegistrationPaymentAtomically`
    // を呼ぶ — Fix commit, レビュー Important #2 で配線済み）。
    const paymentIntentId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : null;

    if (paymentIntentId) {
      await saveEventRegistrationPaymentIntentId(
        registrationId,
        paymentIntentId,
      );
    }

    invalidateEventRegistrationCache();
  }
}
