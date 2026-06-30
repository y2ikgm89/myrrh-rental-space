/**
 * Google Business Profile OAuth Callback Route
 *
 * Authorization Code + state CSRF フローの callback。
 *
 * 1. settings:manage 権限検証 → 未登録なら `/admin/access-denied` にリダイレクト
 * 2. `code` / `state` / `error` クエリ取得（不足時は API 設定ページにリダイレクト）
 * 3. CSRF state 検証（httpOnly cookie と照合、不一致なら拒否）
 * 4. `exchangeGbpAuthCode` で access / refresh token を取得
 * 5. `listGbpAccounts` で先頭アカウントを取得
 * 6. `saveGbpAuthState` で Settings に永続化
 * 7. 設定ページに `gbp_success=true` で戻す
 *
 * @module api/google-business-profile/oauth/callback
 */

import "server-only";

import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { checkPermission } from "@/admin/lib/action-auth";
import { listGbpAccounts } from "@/shared/lib/google-business-profile/account";
import { createOAuth2Client } from "@/shared/lib/google-business-profile/client";
import {
  exchangeGbpAuthCode,
  GBP_OAUTH_STATE_COOKIE,
} from "@/shared/lib/google-business-profile/oauth";
import { saveGbpAuthState } from "@/shared/domain/google-business-profile/settings";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";
import { invalidateSiteWideCacheFromRouteHandler } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { timingSafeEqualStrings } from "@/shared/lib/timing-safe";

function redirectToIntegrationsError(
  request: NextRequest,
  errorCode: string,
): NextResponse {
  return NextResponse.redirect(
    new URL(
      `/admin/settings/integrations?gbp_error=${encodeURIComponent(errorCode)}`,
      request.url,
    ),
  );
}

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const auth = await checkPermission("settings", "manage", request.headers);
    if (!auth.success) {
      if (auth.error.error.includes("ログイン")) {
        return NextResponse.redirect(
          new URL("/admin/access-denied", request.url),
        );
      }
      return redirectToIntegrationsError(request, "forbidden");
    }

    const code = request.nextUrl.searchParams.get("code");
    const state = request.nextUrl.searchParams.get("state");
    const errorParam = request.nextUrl.searchParams.get("error");

    if (errorParam || !code) {
      return redirectToIntegrationsError(request, errorParam ?? "missing_code");
    }

    const cookieStore = await cookies();
    const savedState = cookieStore.get(GBP_OAUTH_STATE_COOKIE)?.value;

    // CSRF state 検証（公式 OAuth 2.0 RFC 6749 §10.12 準拠）
    if (!state || !savedState || !timingSafeEqualStrings(savedState, state)) {
      logError(new Error("CSRF state mismatch in GBP OAuth"), {
        category: ErrorCategory.VALIDATION,
        severity: ErrorSeverity.MEDIUM,
        context: {
          operation: "gbpOauthCallback",
          hasState: Boolean(savedState),
        },
      });
      cookieStore.delete(GBP_OAUTH_STATE_COOKIE);
      return redirectToIntegrationsError(request, "state_mismatch");
    }

    // 検証成功後に cookie を削除（single-use 保証）
    cookieStore.delete(GBP_OAUTH_STATE_COOKIE);

    const tokens = await exchangeGbpAuthCode(code);

    const oauth2Client = createOAuth2Client();
    if (!oauth2Client) throw new Error("OAuth client not configured");
    oauth2Client.setCredentials({
      access_token: tokens.accessToken,
      refresh_token: tokens.refreshToken,
      expiry_date: tokens.expiresAt,
    });
    const accounts = await listGbpAccounts(oauth2Client);
    const firstAccount = accounts[0];
    if (!firstAccount) {
      return redirectToIntegrationsError(request, "no_accounts_found");
    }

    await saveGbpAuthState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountId: firstAccount.accountId,
      accountName: firstAccount.accountName,
    });

    invalidateSiteWideCacheFromRouteHandler(CACHE_TAGS.INTEGRATION_SETTINGS, {
      skipCdnPurge: true,
    });

    return NextResponse.redirect(
      new URL("/admin/settings/integrations?gbp_success=true", request.url),
    );
  } catch (caughtError) {
    unstable_rethrow(caughtError);
    logError(normalizeError(caughtError), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "gbpOauthCallback" },
    });
    return redirectToIntegrationsError(request, "callback_failed");
  }
}
