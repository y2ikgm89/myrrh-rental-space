/**
 * SETTINGS-02 followup: マイページ初回メールアドレス登録の本人確認 URL 着地点。
 *
 * `sendChangeEmailVerificationEmail` が発行する
 * `/api/customer/verify-email?token=<raw>` の GET リクエストを受け取り、
 * `consumeCustomerEmailChangeCommand` で Customer.email に反映する。
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

const SUCCESS_PATH = "/mypage/settings/email-verified";
const ERROR_PATH = "/mypage/settings/email-verified/error";

export async function GET(request: Request): Promise<Response> {
  const url = new URL(request.url);
  const rawToken = url.searchParams.get("token");

  const clientIp = getClientIp(request);
  // token 総当たり牽制 (未認証 endpoint のため、事前チェックを先に敷く)。
  const limit = await emailVerificationConfirmRateLimiter.check(
    rawToken ?? clientIp,
  );
  if (!limit.success) {
    return NextResponse.redirect(new URL(ERROR_PATH, request.url), 302);
  }

  if (!rawToken || rawToken.length === 0) {
    return NextResponse.redirect(new URL(ERROR_PATH, request.url), 302);
  }

  try {
    const { customerId } = await consumeCustomerEmailChangeCommand(rawToken);

    // マイページの customer 情報 (email) はキャッシュされているため、
    // 表示側で古い値が出ないよう明示的に invalidate する。
    invalidateSiteWideCacheFromRouteHandler([
      CACHE_TAGS.CUSTOMERS,
      getCacheTag.customers.detail(customerId),
    ]);

    return NextResponse.redirect(new URL(SUCCESS_PATH, request.url), 302);
  } catch (error) {
    if (error instanceof DomainError) {
      // VALIDATION (invalid/expired/consumed) と CONFLICT (uniqueness) は
      // どちらもエラーページへソフトランディング。UI 側で理由を表示する余地は
      // 残すためクエリで区別する。
      const errorUrl = new URL(ERROR_PATH, request.url);
      errorUrl.searchParams.set(
        "reason",
        error.code === "CONFLICT" ? "conflict" : "invalid",
      );
      return NextResponse.redirect(errorUrl, 302);
    }

    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "customerVerifyEmail" },
    });
    return NextResponse.redirect(new URL(ERROR_PATH, request.url), 302);
  }
}
