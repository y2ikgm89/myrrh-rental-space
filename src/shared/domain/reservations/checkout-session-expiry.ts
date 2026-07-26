import "server-only";

import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { getStripeClient } from "@/shared/lib/stripe";

/** open な Stripe Checkout Session を best-effort で expire する（cron / GCal 削除経路共有）。 */
export async function expireOpenCheckoutSessionBestEffort(input: {
  reservationId: string;
  sessionId: string;
}): Promise<void> {
  try {
    const stripeSettings = await assertStripeCredentialsConfigured();
    const { client } = await getStripeClient(stripeSettings.stripeSecretKey);
    if (!client) return;
    await client.checkout.sessions.expire(input.sessionId);
  } catch (error) {
    // 既に expired / completed の session は Stripe が reject する。
    // CANCELLED claim は既に成功しているため、expire 失敗は観測のみ。
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "expireOpenCheckoutSessionBestEffort",
        reservationId: input.reservationId,
        sessionId: input.sessionId,
      },
    });
  }
}
