import "server-only";

import type Stripe from "stripe";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import { handleCheckoutSessionCompleted } from "./checkout-session-completed";
import { handleAsyncPaymentSucceeded } from "./checkout-session-async-payment-succeeded";
import {
  handleAsyncPaymentFailed,
  handleCheckoutSessionExpired,
} from "./checkout-session-failed";
import { handleChargeRefunded } from "./charge-refunded";

/**
 * Stripe webhook event を event type ごとに handler へ dispatch する。
 * 未対応イベントは no-op（呼び出し元 route が 200 を返す）。
 */
export async function dispatchStripeWebhookEvent(
  event: Stripe.Event,
  stripeClient: AsyncOnlyStripe,
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed":
      await handleCheckoutSessionCompleted(event.data.object, stripeClient);
      break;

    case "checkout.session.async_payment_succeeded":
      await handleAsyncPaymentSucceeded(event.data.object, stripeClient);
      break;

    case "checkout.session.async_payment_failed":
      await handleAsyncPaymentFailed(event.data.object);
      break;

    case "checkout.session.expired":
      await handleCheckoutSessionExpired(event.data.object);
      break;

    case "charge.refunded":
      await handleChargeRefunded(event.data.object);
      break;

    default:
      // 未対応イベントは無視（200 を返す）
      break;
  }
}
