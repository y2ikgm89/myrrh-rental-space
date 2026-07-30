import "server-only";

import { assertStripeCredentialsConfigured } from "@/shared/domain/payment/availability";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
  type ErrorSeverity as ErrorSeverityType,
} from "@/shared/lib/errors/server";
import type { AsyncOnlyStripe } from "@/shared/lib/stripe";
import { getStripeClient } from "@/shared/lib/stripe";

/** 既に取得済み Stripe client で Checkout Session を best-effort expire する。 */
export async function expireCheckoutSessionWithClientBestEffort(input: {
  client: AsyncOnlyStripe;
  sessionId: string;
  operation: string;
  context?: Record<string, string>;
  severity?: ErrorSeverityType;
}): Promise<void> {
  try {
    await input.client.checkout.sessions.expire(input.sessionId);
  } catch (error) {
    // 既に expired / completed の session は Stripe が reject する。
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: input.severity ?? ErrorSeverity.MEDIUM,
      context: {
        operation: input.operation,
        sessionId: input.sessionId,
        ...input.context,
      },
    });
  }
}

/** open な Stripe Checkout Session を best-effort で expire する（決済 create 失敗 / cron / cancel 共有）。 */
export async function expireOpenCheckoutSessionBestEffort(input: {
  sessionId: string;
  context?: Record<string, string>;
}): Promise<void> {
  try {
    const stripeSettings = await assertStripeCredentialsConfigured();
    const { client } = getStripeClient(stripeSettings.stripeSecretKey);
    if (!client) return;
    await expireCheckoutSessionWithClientBestEffort({
      client,
      sessionId: input.sessionId,
      operation: "expireOpenCheckoutSessionBestEffort",
      ...(input.context ? { context: input.context } : {}),
      severity: ErrorSeverity.LOW,
    });
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        operation: "expireOpenCheckoutSessionBestEffort",
        sessionId: input.sessionId,
        ...input.context,
      },
    });
  }
}

/** Stripe Checkout Session の status を取得する（manual payment gate 等）。 */
export async function retrieveCheckoutSessionStatus(
  sessionId: string,
): Promise<string | null> {
  const stripeSettings = await assertStripeCredentialsConfigured();
  const { client } = getStripeClient(stripeSettings.stripeSecretKey);
  if (!client) {
    return null;
  }
  const session = await client.checkout.sessions.retrieve(sessionId);
  return session.status ?? null;
}
