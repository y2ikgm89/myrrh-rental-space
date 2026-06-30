/**
 * Google Business Profile API クライアント生成 + token refresh handler。
 *
 * `mybusinessbusinessinformation` v1 (Location 編集) を返す。
 * OAuth2Client は env の `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` から生成し、
 * `tokens` イベントで refresh された access token を Settings に永続化する。
 */

import "server-only";

import { google } from "googleapis";

import { serverEnv } from "@/shared/lib/env/server";
import { getAdminAppUrl } from "@/shared/lib/admin-urls";

import { saveGbpAuthState } from "@/shared/domain/google-business-profile/settings";
import type { GbpAuthState } from "./types";

/** GBP API に必要な OAuth スコープ */
export const GBP_SCOPES: readonly string[] = [
  "https://www.googleapis.com/auth/business.manage",
];

const OAUTH_CALLBACK_PATH = "/api/google-business-profile/oauth/callback";

/**
 * GBP OAuth 用の OAuth2Client を生成する。
 * `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` が未設定なら null を返す。
 */
export function createOAuth2Client(): InstanceType<
  typeof google.auth.OAuth2
> | null {
  if (!serverEnv.GOOGLE_CLIENT_ID || !serverEnv.GOOGLE_CLIENT_SECRET) {
    return null;
  }

  const baseUrl = serverEnv.BETTER_AUTH_URL ?? getAdminAppUrl();
  return new google.auth.OAuth2(
    serverEnv.GOOGLE_CLIENT_ID,
    serverEnv.GOOGLE_CLIENT_SECRET,
    `${baseUrl}${OAUTH_CALLBACK_PATH}`,
  );
}

/**
 * GBP `mybusinessbusinessinformation` v1 client を生成する。
 *
 * - `auth` で渡された GbpAuthState を OAuth2Client に setCredentials
 * - `tokens` イベントで refresh された access token を Settings に永続化
 * - OAuth credentials が未設定なら例外を throw
 */
export async function getGbpClient(auth: GbpAuthState) {
  const oauth2Client = createOAuth2Client();
  if (!oauth2Client) {
    throw new Error("Google OAuth client credentials not configured");
  }

  oauth2Client.setCredentials({
    access_token: auth.accessToken,
    refresh_token: auth.refreshToken,
    expiry_date: auth.expiresAt,
  });

  oauth2Client.on("tokens", (tokens) => {
    if (!tokens.access_token) return;
    void saveGbpAuthState({
      accessToken: tokens.access_token,
      refreshToken: tokens.refresh_token ?? auth.refreshToken,
      expiresAt: tokens.expiry_date ?? auth.expiresAt,
      accountId: auth.accountId,
      accountName: auth.accountName,
    });
  });

  return google.mybusinessbusinessinformation({
    version: "v1",
    auth: oauth2Client,
  });
}
