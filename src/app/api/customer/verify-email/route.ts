/**
 * SETTINGS-02 followup: マイページ初回メールアドレス登録の本人確認 URL 着地点。
 *
 * HTTP-02 (link scanner 対策) の 2-step flow:
 * - GET  `/api/customer/verify-email?token=<raw>` — 確認ページへ redirect のみ (token 消費なし)
 * - POST `/api/customer/verify-email` — `consumeCustomerEmailChangeCommand` で Customer.email に反映
 *
 * 新規メールのリンクは `/mypage/settings/confirm-email?token=...` を正本とする。
 * 旧メールの `/api/customer/verify-email?token=...` は GET redirect で後方互換を維持する。
 *
 * @module app/api/customer/verify-email
 */

import { NextResponse } from "next/server";
import { consumeCustomerEmailChangeCommand } from "@/shared/domain/customers/commands";
import { DomainError } from "@/shared/domain/domain-error";
import {
  emailVerificationConfirmRateLimiter,
  getClientIp,
} from "@/shared/lib/rate-limit";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";

const CONFIRM_PATH = "/mypage/settings/confirm-email";
const SUCCESS_PATH = "/mypage/settings/email-verified";
const ERROR_PATH = "/mypage/settings/email-verified/error";

function redirectToConfirmPage(request: Request, rawToken: string): Response {
  const confirmUrl = new URL(CONFIRM_PATH, request.url);
  confirmUrl.searchParams.set("token", rawToken);
  return NextResponse.redirect(confirmUrl, 302);
}

function redirectToErrorPage(
  request: Request,
  reason?: "conflict" | "invalid",
): Response {
  const errorUrl = new URL(ERROR_PATH, request.url);
  if (reason) {
    errorUrl.searchParams.set("reason", reason);
  }
  return NextResponse.redirect(errorUrl, 302);
}

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");

  const clientIp = getClientIp(request);
  const limit = await emailVerificationConfirmRateLimiter.check(
    rawToken ?? clientIp,
  );
  if (!limit.success) {
    return redirectToErrorPage(request);
  }

  if (!rawToken || rawToken.length === 0) {
    return redirectToErrorPage(request);
  }

  return redirectToConfirmPage(request, rawToken);
}

export async function POST(request: Request): Promise<Response> {
  const clientIp = getClientIp(request);

  let formData: FormData;
  try {
    formData = await request.formData();
  } catch {
    return redirectToErrorPage(request);
  }

  const tokenValue = formData.get("token");
  const rawToken = typeof tokenValue === "string" ? tokenValue : null;

  const limit = await emailVerificationConfirmRateLimiter.check(
    rawToken ?? clientIp,
  );
  if (!limit.success) {
    return redirectToErrorPage(request);
  }

  if (!rawToken || rawToken.length === 0) {
    return redirectToErrorPage(request);
  }

  try {
    const { customerId } = await consumeCustomerEmailChangeCommand(rawToken);

    invalidateSiteWideCacheFromRouteHandler([
      CACHE_TAGS.CUSTOMERS,
      getCacheTag.customers.detail(customerId),
    ]);

    return NextResponse.redirect(new URL(SUCCESS_PATH, request.url), 302);
  } catch (error) {
    if (error instanceof DomainError) {
      const reason = error.code === "CONFLICT" ? "conflict" : "invalid";
      return redirectToErrorPage(request, reason);
    }

    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "customerVerifyEmail" },
    });
    return redirectToErrorPage(request);
  }
}
