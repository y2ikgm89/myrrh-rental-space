import "server-only";

import type Stripe from "stripe";
import { claimReservationAsFailed } from "@/shared/domain/reservations/payment-queries";
import { claimEventRegistrationAsFailed } from "@/shared/domain/events/payment-queries";
import { extractPaymentSubject } from "./checkout-helpers";
import {
  invalidateEventRegistrationCache,
  invalidateReservationCache,
} from "./cache-invalidation";

/**
 * checkout.session.async_payment_failed
 *
 * 非同期決済が失敗した場合に発火。
 */
export async function handleAsyncPaymentFailed(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookAsyncPaymentFailed",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    // session.id を渡して stale webhook が別 session の PENDING を巻き込むのを封殺
    // (Codex PR #1043 P1: FAILED→PENDING re-checkout race)。
    const claimed = await claimReservationAsFailed(
      subject.reservationId,
      session.id,
    );
    if (claimed) {
      invalidateReservationCache(subject.reservationId);
    }
    return;
  }

  // WAITLISTED_OFFERED status には触れない（cron `waitlist-expire` が期限切れを
  // 処理する）。paymentStatus のみ FAILED に claim する。
  const claimed = await claimEventRegistrationAsFailed(
    subject.registrationId,
    session.id,
  );
  if (claimed) {
    invalidateEventRegistrationCache();
  }
}

/**
 * checkout.session.expired
 *
 * Checkout Session の有効期限切れ。paymentStatus → FAILED。
 * PAID / REFUNDED 済みは `claimReservationAsFailed` 内で skip される。
 */
export async function handleCheckoutSessionExpired(
  session: Stripe.Checkout.Session,
): Promise<void> {
  const subject = extractPaymentSubject(
    session,
    "stripeWebhookCheckoutExpired",
  );
  if (!subject) return;

  if (subject.kind === "reservation") {
    // session.id を渡して stale webhook が別 session の PENDING を巻き込むのを封殺
    // (Codex PR #1043 P1: FAILED→PENDING re-checkout race)。
    const claimed = await claimReservationAsFailed(
      subject.reservationId,
      session.id,
    );
    if (claimed) {
      invalidateReservationCache(subject.reservationId);
    }
    return;
  }

  // WAITLISTED_OFFERED status には触れない（cron `waitlist-expire` が期限切れを
  // 処理する）。paymentStatus のみ FAILED に claim する。
  const claimed = await claimEventRegistrationAsFailed(
    subject.registrationId,
    session.id,
  );
  if (claimed) {
    invalidateEventRegistrationCache();
  }
}
