import "server-only";

import type Stripe from "stripe";
import { getReservationCheckoutExpectedAmount } from "@/shared/domain/reservations/payment-queries";
import { getEventRegistrationCheckoutExpectedAmount } from "@/shared/domain/events/payment-queries";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import {
  checkoutSessionAmountMatchesExpected,
  extractPaymentSubject,
  orchestrateCheckoutAmountMismatchRefund,
} from "./checkout-helpers";
import { fulfillEventRegistrationPaymentAtomically } from "./fulfill-event-registration-payment";
import { fulfillReservationPaymentAtomically } from "./fulfill-reservation-payment";

/**
 * checkout.session.async_payment_succeeded
 *
 * 銀行振込 / konbini 等の非同期決済が成功した場合に発火。
 * checkout.session.completed で "unpaid" だった予約 / イベント申込を fulfill する。
 *
 * この event type は Stripe が非同期決済の成功確定時にのみ送出するため、
 * checkout.session.completed と異なり `session.payment_status` による分岐は
 * 不要（常に確定済み扱いで良い）。event-registration 側は
 * `fulfillEventRegistrationPaymentAtomically` を共有する（waitlist offer は
 * 同関数内で `confirmWaitlistOfferCommand` の容量再チェックを経由し、直接購入は
 * 経由しない — checkout.session.completed と同じ分岐契約）。atomic claim
 * （`paymentStatus not PAID` 相当の WHERE）が二重処理を防ぐため、
 * checkout.session.completed（即時決済）と本 handler（非同期決済）の両方から
 * 同じ registration/reservation に対して呼ばれても安全（Task 9 report 参照）。
 */
export async function handleAsyncPaymentSucceeded(
  session: Stripe.Checkout.Session,
  stripeClient: AsyncOnlyStripe,
): Promise<void> {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookAsyncPaymentSucceeded",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    const expectedAmount = await getReservationCheckoutExpectedAmount(
      subject.reservationId,
    );
    const amountOk = checkoutSessionAmountMatchesExpected(
      session,
      expectedAmount,
      "stripeWebhookAsyncPaymentSucceeded",
      "reservationId",
      subject.reservationId,
    );
    if (!amountOk) {
      await orchestrateCheckoutAmountMismatchRefund(
        session,
        subject,
        expectedAmount,
        "stripeWebhookAsyncPaymentSucceeded",
        stripeClient,
      );
      return;
    }

    await fulfillReservationPaymentAtomically(subject.reservationId, session);
    return;
  }

  const expectedAmount = await getEventRegistrationCheckoutExpectedAmount(
    subject.registrationId,
  );
  const amountOk = checkoutSessionAmountMatchesExpected(
    session,
    expectedAmount,
    "stripeWebhookAsyncPaymentSucceeded",
    "registrationId",
    subject.registrationId,
  );
  if (!amountOk) {
    await orchestrateCheckoutAmountMismatchRefund(
      session,
      subject,
      expectedAmount,
      "stripeWebhookAsyncPaymentSucceeded",
      stripeClient,
    );
    return;
  }

  await fulfillEventRegistrationPaymentAtomically(
    subject.registrationId,
    session,
    stripeClient,
  );
}
