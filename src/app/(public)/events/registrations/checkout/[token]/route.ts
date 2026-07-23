/**
 * 有料イベント直接申込の Stripe Checkout 起動 Route Handler。
 *
 * ゲスト申込 (customerId=null) 向け。確認メールの token URL から
 * `createEventCheckoutSessionCommand` を actorCustomerId=null で呼び出す。
 */

import { NextResponse } from "next/server";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
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

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
): Promise<NextResponse> {
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

  const { token } = await params;
  const verified = verifyEventRegistrationPaymentToken(token);
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
