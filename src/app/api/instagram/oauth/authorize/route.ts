/**
 * Instagram OAuth Authorization Route
 *
 * Instagram認証フローの開始エンドポイント
 * CSRF対策のstateを生成し、Instagram認証URLにリダイレクト
 *
 * @module api/instagram/oauth/authorize
 */

import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { serverEnv } from "@/shared/lib/env/server";
import { clientEnv } from "@/shared/lib/env/client";
import { getAdminSession, getAdminSessionUser } from "@/shared/lib/admin-auth";
import { isAdminRole, isSuperAdminRole } from "@/admin/lib/role-guards";

const INSTAGRAM_OAUTH_URL = "https://www.instagram.com/oauth/authorize";
const STATE_COOKIE_NAME = "instagram_oauth_state";
const STATE_COOKIE_MAX_AGE = 600; // 10分

/**
 * Instagram OAuth認証開始
 * GET /api/instagram/oauth/authorize
 *
 * 1. 環境変数チェック
 * 2. CSRF対策用のstate生成
 * 3. stateをcookieに保存
 * 4. Instagram認証URLにリダイレクト
 */
export async function GET(request: Request) {
  // 認証チェック
  const session = await getAdminSession(request.headers);
  const user = getAdminSessionUser(session);
  if (!user || (!isAdminRole(user.role) && !isSuperAdminRole(user.role))) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 環境変数チェック
  const clientId = serverEnv.INSTAGRAM_APP_ID;
  const redirectUri = serverEnv.INSTAGRAM_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    const settingsUrl = new URL("/admin/settings/integrations", getBaseUrl());
    settingsUrl.searchParams.set("tab", "instagram");
    settingsUrl.searchParams.set(
      "error",
      "Instagram連携の設定が不完全です。管理者にお問い合わせください。",
    );
    return NextResponse.redirect(settingsUrl);
  }

  // CSRF対策用のstate生成
  const state = crypto.randomUUID();

  // stateをcookieに保存
  const cookieStore = await cookies();
  cookieStore.set(STATE_COOKIE_NAME, state, {
    httpOnly: true,
    secure: serverEnv.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: STATE_COOKIE_MAX_AGE,
    path: "/",
  });

  // Instagram認証URLを構築
  const authUrl = new URL(INSTAGRAM_OAUTH_URL);
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("scope", "instagram_business_basic");
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("state", state);

  return NextResponse.redirect(authUrl);
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
