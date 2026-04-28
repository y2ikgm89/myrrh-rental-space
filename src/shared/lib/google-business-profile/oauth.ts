/**
 * Google Business Profile OAuth フロー: authorize URL / token exchange / revoke。
 *
 * Authorization Code フローを採用し offline access + consent 強制で refresh token を取得する。
 */

import "server-only";

import {
  ErrorCategory,
  ErrorSeverity,
  logError,
  normalizeError,
} from "@/shared/lib/errors/server";

import { GBP_SCOPES, createOAuth2Client } from "./client";

type ExchangeGbpAuthCodeResult = {
  readonly accessToken: string;
  readonly refreshToken: string;
  readonly expiresAt: number;
};

/**
 * Authorize URL を組み立てる。
 *
 * - `access_type: "offline"` で refresh token を要求
 * - `prompt: "consent"` で同意画面を必ず表示し refresh token を確実に取得
 * - `state` は CSRF 対策トークン（呼び出し側で random ID を生成して渡す）
 */
export function getGbpAuthorizeUrl(state: string): string {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    throw new Error("Google OAuth client credentials not configured");
  }

  return oauth2Client.generateAuthUrl({
    access_type: "offline",
    prompt: "consent",
    scope: [...GBP_SCOPES],
    state,
  });
}

/**
 * Authorization code を access token / refresh token に交換する。
 *
 * `getToken` が返す `tokens.access_token` / `tokens.refresh_token` /
 * `tokens.expiry_date` を検証し整形して返す。
 */
export async function exchangeGbpAuthCode(
  code: string,
): Promise<ExchangeGbpAuthCodeResult> {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    throw new Error("Google OAuth client credentials not configured");
  }

  const { tokens } = await oauth2Client.getToken(code);

  if (!tokens.access_token) {
    throw new Error("Google did not return an access token");
  }
  if (!tokens.refresh_token) {
    throw new Error(
      "Google did not return a refresh token. Re-authorize with prompt=consent.",
    );
  }
  if (typeof tokens.expiry_date !== "number") {
    throw new Error("Google did not return a valid token expiry date");
  }

  return {
    accessToken: tokens.access_token,
    refreshToken: tokens.refresh_token,
    expiresAt: tokens.expiry_date,
  };
}

/**
 * Refresh token を Google 側で revoke する。
 *
 * 失敗してもユーザー体験を阻害しないため throw せず `logError`（LOW）でログする。
 */
export async function revokeGbpToken(refreshToken: string): Promise<void> {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    return;
  }

  try {
    await oauth2Client.revokeToken(refreshToken);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.LOW,
      context: { operation: "revokeGbpToken" },
    });
  }
}
