/**
 * Instagram OAuth Callback Route
 *
 * Instagram認証フローのコールバックエンドポイント
 * 認証コードをトークンに交換し、設定を保存
 *
 * @module api/instagram/oauth/callback
 */

import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { cookies } from "next/headers";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { serverEnv } from "@/shared/lib/env/server";
import { clientEnv } from "@/shared/lib/env/client";
import { getSession, getRoleFromSession } from "@/shared/lib/auth";
import { isAdminRole, isSuperAdminRole } from "@/admin/lib/role-guards";
import { connectInstagramOAuthAccount } from "@/shared/domain/instagram/commands";
import {
  exchangeCodeForToken,
  exchangeForLongLivedToken,
  fetchInstagramUserInfo,
} from "@/shared/lib/instagram";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";

const STATE_COOKIE_NAME = "instagram_oauth_state";
const instagramOAuthCallbackQuerySchema = z.object({
  code: z.string().trim().min(1).optional(),
  state: z.string().trim().min(1).optional(),
  error: z.string().trim().min(1).optional(),
  error_reason: z.string().trim().min(1).optional(),
  error_description: z.string().trim().min(1).optional(),
});

/**
 * Instagram OAuth コールバック
 * GET /api/instagram/oauth/callback
 *
 * 1. code, state, error パラメータ取得
 * 2. エラーチェック
 * 3. CSRF検証
 * 4. 短期トークン取得
 * 5. 長期トークンに交換
 * 6. ユーザー情報取得
 * 7. トークン暗号化して保存
 * 8. 設定ページにリダイレクト
 */
export async function GET(request: NextRequest) {
  // 認証チェック
  const session = await getSession(request.headers);
  const role = getRoleFromSession(session);
  if (
    !session?.user ||
    !role ||
    (!isAdminRole(role) && !isSuperAdminRole(role))
  ) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const parsedQuery = instagramOAuthCallbackQuerySchema.safeParse({
    code: request.nextUrl.searchParams.get("code") ?? undefined,
    state: request.nextUrl.searchParams.get("state") ?? undefined,
    error: request.nextUrl.searchParams.get("error") ?? undefined,
    error_reason: request.nextUrl.searchParams.get("error_reason") ?? undefined,
    error_description:
      request.nextUrl.searchParams.get("error_description") ?? undefined,
  });

  if (!parsedQuery.success) {
    return redirectToSettings({ error: "認証パラメータが不正です" });
  }

  const { code, state, error, error_reason, error_description } =
    parsedQuery.data;

  // エラーチェック（ユーザーが認証をキャンセルした場合など）
  if (error) {
    logError(new Error("Instagram OAuth error"), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: {
        error,
        error_reason,
        error_description,
        operation: "instagramOAuthCallback",
      },
    });
    return redirectToSettings({
      error: "Instagram認証に失敗しました。再度お試しください。",
    });
  }

  // 必須パラメータチェック
  if (!code || !state) {
    return redirectToSettings({ error: "認証パラメータが不足しています" });
  }

  // CSRF検証
  const cookieStore = await cookies();
  const savedState = cookieStore.get(STATE_COOKIE_NAME)?.value;

  if (!savedState || savedState !== state) {
    logError(new Error("CSRF state mismatch in Instagram OAuth"), {
      category: ErrorCategory.VALIDATION,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "instagramOAuthCallback", hasState: !!savedState },
    });
    return redirectToSettings({
      error: "認証の検証に失敗しました。再度お試しください。",
    });
  }

  // state cookieを削除
  cookieStore.delete(STATE_COOKIE_NAME);

  // 環境変数チェック
  const clientId = serverEnv.INSTAGRAM_APP_ID;
  const clientSecret = serverEnv.INSTAGRAM_APP_SECRET;
  const redirectUri = serverEnv.INSTAGRAM_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    return redirectToSettings({
      error: "Instagram連携の設定が不完全です。管理者にお問い合わせください。",
    });
  }

  try {
    // 短期トークン取得
    const { accessToken: shortLivedToken, userId } = await exchangeCodeForToken(
      code,
      clientId,
      clientSecret,
      redirectUri,
    );

    // 長期トークンに交換
    const { accessToken: longLivedToken, expiresIn } =
      await exchangeForLongLivedToken(shortLivedToken, clientSecret);

    // ユーザー情報取得
    const userInfo = await fetchInstagramUserInfo(longLivedToken);

    await connectInstagramOAuthAccount({
      accessToken: longLivedToken,
      expiresIn,
      userId,
      username: userInfo.username,
      accountType: userInfo.accountType,
    });

    return redirectToSettings({
      success: `@${userInfo.username} として接続されました`,
    });
  } catch (error) {
    unstable_rethrow(error);
    logError(error instanceof Error ? error : new Error(String(error)), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: { operation: "instagramOAuthCallback" },
    });

    return redirectToSettings({
      error: "Instagram認証に失敗しました。再度お試しください。",
    });
  }
}

/**
 * 設定ページにリダイレクト
 */
function redirectToSettings(params: { error?: string; success?: string }) {
  const baseUrl = getBaseUrl();
  const settingsUrl = new URL("/admin/settings/api", baseUrl);
  settingsUrl.searchParams.set("tab", "instagram");

  if (params.error) {
    settingsUrl.searchParams.set("error", params.error);
  }
  if (params.success) {
    settingsUrl.searchParams.set("success", params.success);
  }

  return NextResponse.redirect(settingsUrl);
}

/**
 * ベースURLを取得
 */
function getBaseUrl(): string {
  if (serverEnv.BETTER_AUTH_URL) {
    return serverEnv.BETTER_AUTH_URL;
  }
  // フォールバック（Cloud Run では NEXT_PUBLIC_APP_URL を明示設定すること）
  return clientEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
}
