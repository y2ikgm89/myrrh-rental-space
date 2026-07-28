/**
 * 有料イベント直接申込の Stripe Checkout 起動 Route Handler。
 *
 * ゲスト申込 (customerId=null) 向け。確認メールの `?token=` URL は `proxy.ts` が
 * HttpOnly cookie に転写してから本 route に到達する。`createEventCheckoutSessionCommand`
 * を actorCustomerId=null で呼び出す。
 *
 * 冒頭 `await connection()` で build prerender を skip する（静的 path のため
 * `[token]` 時代と違い params だけでは動的化されない。`requireFeatureEnabled` の
 * DB 読取を build 時に走らせない）。
 */

import { cookies } from "next/headers";
import { connection, NextResponse } from "next/server";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { EVENT_REGISTRATION_PAYMENT_TOKEN_COOKIE_NAME } from "@/shared/lib/constants/event-registration-payment-token-cookie-name";
import { verifyEventRegistrationPaymentToken } from "@/shared/lib/tokens/event-registration-payment-token";
import { createEventCheckoutSessionCommand } from "@/shared/domain/events/payment-commands";
import { DomainError } from "@/shared/domain/domain-error";
import { publicQueryRateLimiter, getClientIp } from "@/shared/lib/rate-limit";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const CHECKOUT_ERROR_PATH = "/events/registrations/checkout-error";

export async function GET(request: Request): Promise<NextResponse> {
  await connection();
  await requireFeatureEnabled("events");
  await requireFeatureEnabled("payment");

  const clientIp = getClientIp(request);
  const limit = await publicQueryRateLimiter.check(clientIp);
  if (!limit.success) {
    return NextResponse.redirect(
      new URL(CHECKOUT_ERROR_PATH, request.url),
      302,
    );
  }

  // proxy が `?token=` を HttpOnly cookie に転写済み。URL クエリは残さない。
  const cookieStore = await cookies();
  const token =
    cookieStore.get(EVENT_REGISTRATION_PAYMENT_TOKEN_COOKIE_NAME)?.value ??
    null;
  const verified = token ? verifyEventRegistrationPaymentToken(token) : null;
  if (!verified) {
    return NextResponse.redirect(
      new URL(CHECKOUT_ERROR_PATH, request.url),
      302,
    );
  }

  try {
    const result = await createEventCheckoutSessionCommand({
      registrationId: verified.registrationId,
      actorCustomerId: null,
    });

    if (result.sessionUrl) {
      return NextResponse.redirect(result.sessionUrl, 302);
    }

    return NextResponse.redirect(
      new URL(CHECKOUT_ERROR_PATH, request.url),
      302,
    );
  } catch (error) {
    if (error instanceof DomainError) {
      logError(error, {
        category: ErrorCategory.EXTERNAL_API,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "eventRegistrationCheckoutRoute",
          registrationId: verified.registrationId,
          code: error.code,
        },
      });
      return NextResponse.redirect(
        new URL(CHECKOUT_ERROR_PATH, request.url),
        302,
      );
    }

    throw error;
  }
}
