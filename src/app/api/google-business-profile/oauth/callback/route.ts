/**
 * Google Business Profile OAuth Callback Route
 *
 * Authorization Code フローの callback。
 *
 * 1. 管理者セッション検証 → 未認証なら `/admin/login` にリダイレクト
 * 2. `code` / `error` クエリ取得（不足時は API 設定ページにリダイレクト）
 * 3. `exchangeGbpAuthCode` で access / refresh token を取得
 * 4. `listGbpAccounts` で先頭アカウントを取得
 * 5. `saveGbpAuthState` で Settings に永続化
 * 6. 設定ページに `gbp_success=true` で戻す
 *
 * @module api/google-business-profile/oauth/callback
 */

import "server-only";

import { NextResponse, type NextRequest } from "next/server";
import { unstable_rethrow } from "next/navigation";

import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { listGbpAccounts } from "@/shared/lib/google-business-profile/account";
import { createOAuth2Client } from "@/shared/lib/google-business-profile/client";
import { exchangeGbpAuthCode } from "@/shared/lib/google-business-profile/oauth";
import { saveGbpAuthState } from "@/shared/lib/google-business-profile/settings";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const session = await getAdminSession(request.headers);
    const user = getAdminSessionUser(session);
    if (!user) {
      return NextResponse.redirect(new URL("/admin/login", request.url));
    }

    const code = request.nextUrl.searchParams.get("code");
    const errorParam = request.nextUrl.searchParams.get("error");

    if (errorParam || !code) {
      return NextResponse.redirect(
        new URL(
          `/admin/settings/api?gbp_error=${encodeURIComponent(errorParam ?? "missing_code")}`,
          request.url,
        ),
      );
    }

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
      return NextResponse.redirect(
        new URL("/admin/settings/api?gbp_error=no_accounts_found", request.url),
      );
    }

    await saveGbpAuthState({
      accessToken: tokens.accessToken,
      refreshToken: tokens.refreshToken,
      expiresAt: tokens.expiresAt,
      accountId: firstAccount.accountId,
      accountName: firstAccount.accountName,
    });

    return NextResponse.redirect(
      new URL("/admin/settings/api?gbp_success=true", request.url),
    );
  } catch (caughtError) {
    unstable_rethrow(caughtError);
    logError(normalizeError(caughtError), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "gbpOauthCallback" },
    });
    return NextResponse.redirect(
      new URL("/admin/settings/api?gbp_error=callback_failed", request.url),
    );
  }
}
