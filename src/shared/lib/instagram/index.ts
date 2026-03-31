/**
 * Instagram API Utilities
 *
 * Instagram Graph API / Basic Display API を使用した機能群
 * トークン管理、フィード取得、oEmbed取得などのユーティリティ
 *
 * @module shared/lib/instagram
 */

import { z } from "zod";
import type { ApiKeyTestResult } from "@/shared/types/api-keys";
import { isValidInstagramToken } from "@/shared/lib/validations/instagram";
import { maskApiKey } from "@/shared/lib/api-keys";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// Zod Schemas for API Responses
// =============================================================================

const InstagramMediaTypeSchema = z.enum(["IMAGE", "VIDEO", "CAROUSEL_ALBUM"]);

const InstagramApiMediaSchema = z.object({
  id: z.string(),
  caption: z.string().optional(),
  media_type: InstagramMediaTypeSchema,
  media_url: z.string(),
  permalink: z.string(),
  thumbnail_url: z.string().optional(),
  timestamp: z.string(),
});

const InstagramApiFeedResponseSchema = z.object({
  data: z.array(InstagramApiMediaSchema),
  paging: z
    .object({
      cursors: z
        .object({
          after: z.string().optional(),
          before: z.string().optional(),
        })
        .optional(),
      next: z.string().optional(),
    })
    .optional(),
});

const InstagramApiUserResponseSchema = z.object({
  id: z.string(),
  username: z.string(),
  account_type: z.string(),
  media_count: z.number().optional(),
});

const InstagramApiErrorSchema = z.object({
  error: z
    .object({
      message: z.string(),
      type: z.string(),
      code: z.number(),
    })
    .optional(),
});

const InstagramOembedApiResponseSchema = z.object({
  html: z.string(),
  width: z.number(),
  height: z.number().optional(),
  author_name: z.string().optional(),
  provider_name: z.string(),
});

const ExchangeTokenResponseSchema = z.object({
  access_token: z.string(),
  user_id: z.number(),
});

const LongLivedTokenResponseSchema = z.object({
  access_token: z.string(),
  token_type: z.string(),
  expires_in: z.number(),
});

// =============================================================================
// Types
// =============================================================================

export type InstagramMediaType = "IMAGE" | "VIDEO" | "CAROUSEL_ALBUM";

export interface InstagramMediaItem {
  id: string;
  caption?: string;
  mediaType: InstagramMediaType;
  mediaUrl: string;
  permalink: string;
  thumbnailUrl?: string;
  timestamp: string;
}

export interface InstagramUserInfo {
  id: string;
  username: string;
  accountType: string;
  mediaCount?: number;
}

export interface InstagramOembedResponse {
  html: string;
  width: number;
  height?: number;
  authorName?: string;
  providerName: string;
}

// =============================================================================
// API Base URL
// =============================================================================

const INSTAGRAM_GRAPH_API_BASE = "https://graph.instagram.com";
const INSTAGRAM_OEMBED_API =
  "https://graph.facebook.com/v18.0/instagram_oembed";
const INSTAGRAM_OAUTH_BASE = "https://api.instagram.com/oauth";

// =============================================================================
// Feed Functions
// =============================================================================

/**
 * Instagramフィードを取得
 *
 * @param accessToken - Instagram Basic Display APIアクセストークン
 * @param limit - 取得する投稿数（デフォルト: 12、最大: 24）
 * @returns フィードアイテム配列
 */
export async function fetchInstagramFeed(
  accessToken: string,
  limit = 12,
): Promise<InstagramMediaItem[]> {
  const clampedLimit = Math.min(Math.max(1, limit), 24);

  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me/media`);
  url.searchParams.set(
    "fields",
    "id,caption,media_type,media_url,permalink,thumbnail_url,timestamp",
  );
  url.searchParams.set("limit", String(clampedLimit));
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString(), {
    next: { revalidate: 3600 }, // 1時間キャッシュ
  });

  if (!response.ok) {
    const errorResult = InstagramApiErrorSchema.safeParse(
      await response.json(),
    );
    const errorMessage = errorResult.success
      ? errorResult.data.error?.message
      : undefined;
    throw new Error(errorMessage || `Instagram API error: ${response.status}`);
  }

  const jsonData: unknown = await response.json();
  const parseResult = InstagramApiFeedResponseSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new Error(
      `Invalid Instagram API response: ${parseResult.error.message}`,
    );
  }

  return parseResult.data.data.map((item) =>
    omitUndefined({
      id: item.id,
      caption: item.caption,
      mediaType: item.media_type,
      mediaUrl: item.media_url,
      permalink: item.permalink,
      thumbnailUrl: item.thumbnail_url,
      timestamp: item.timestamp,
    }),
  );
}

// =============================================================================
// oEmbed Functions
// =============================================================================

/**
 * Instagram投稿のoEmbed HTMLを取得
 *
 * @param postUrl - Instagram投稿URL
 * @param accessToken - Facebook App Access Token
 * @returns oEmbedレスポンス
 */
export async function fetchInstagramOembed(
  postUrl: string,
  accessToken: string,
): Promise<InstagramOembedResponse> {
  const url = new URL(INSTAGRAM_OEMBED_API);
  url.searchParams.set("url", postUrl);
  url.searchParams.set("access_token", accessToken);
  url.searchParams.set("omitscript", "true"); // クライアント側でscriptを制御

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorResult = InstagramApiErrorSchema.safeParse(
      await response.json(),
    );
    const errorMessage = errorResult.success
      ? errorResult.data.error?.message
      : undefined;
    throw new Error(errorMessage || `oEmbed API error: ${response.status}`);
  }

  const jsonData: unknown = await response.json();
  const parseResult = InstagramOembedApiResponseSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new Error(
      `Invalid oEmbed API response: ${parseResult.error.message}`,
    );
  }

  return omitUndefined({
    html: parseResult.data.html,
    width: parseResult.data.width,
    height: parseResult.data.height,
    authorName: parseResult.data.author_name,
    providerName: parseResult.data.provider_name,
  });
}

// =============================================================================
// OAuth Token Exchange Functions
// =============================================================================

/**
 * 認証コードを短期トークンに交換
 *
 * @param code - OAuth認証コード
 * @param clientId - Instagram App ID
 * @param clientSecret - Instagram App Secret
 * @param redirectUri - リダイレクトURI
 * @returns 短期アクセストークン
 */
export async function exchangeCodeForToken(
  code: string,
  clientId: string,
  clientSecret: string,
  redirectUri: string,
): Promise<{ accessToken: string; userId: string }> {
  const response = await fetch(`${INSTAGRAM_OAUTH_BASE}/access_token`, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      redirect_uri: redirectUri,
      code,
    }),
  });

  if (!response.ok) {
    const errorResult = InstagramApiErrorSchema.safeParse(
      await response.json(),
    );
    const errorMessage = errorResult.success
      ? errorResult.data.error?.message
      : undefined;
    throw new Error(
      errorMessage || `Token exchange failed: ${response.status}`,
    );
  }

  const jsonData: unknown = await response.json();
  const parseResult = ExchangeTokenResponseSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new Error(
      `Invalid token exchange response: ${parseResult.error.message}`,
    );
  }

  return {
    accessToken: parseResult.data.access_token,
    userId: String(parseResult.data.user_id),
  };
}

/**
 * 短期トークンを長期トークンに交換
 *
 * @param shortLivedToken - 短期アクセストークン
 * @param clientSecret - Instagram App Secret
 * @returns 長期アクセストークンと有効期限
 */
export async function exchangeForLongLivedToken(
  shortLivedToken: string,
  clientSecret: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/access_token`);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", clientSecret);
  url.searchParams.set("access_token", shortLivedToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorResult = InstagramApiErrorSchema.safeParse(
      await response.json(),
    );
    const errorMessage = errorResult.success
      ? errorResult.data.error?.message
      : undefined;
    throw new Error(
      errorMessage || `Long-lived token exchange failed: ${response.status}`,
    );
  }

  const jsonData: unknown = await response.json();
  const parseResult = LongLivedTokenResponseSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new Error(
      `Invalid long-lived token response: ${parseResult.error.message}`,
    );
  }

  return {
    accessToken: parseResult.data.access_token,
    expiresIn: parseResult.data.expires_in, // 秒単位（通常60日）
  };
}

/**
 * 長期トークンをリフレッシュ
 *
 * @param longLivedToken - 長期アクセストークン
 * @returns 新しい長期アクセストークンと有効期限
 */
export async function refreshLongLivedToken(
  longLivedToken: string,
): Promise<{ accessToken: string; expiresIn: number }> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/refresh_access_token`);
  url.searchParams.set("grant_type", "ig_refresh_token");
  url.searchParams.set("access_token", longLivedToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorResult = InstagramApiErrorSchema.safeParse(
      await response.json(),
    );
    const errorMessage = errorResult.success
      ? errorResult.data.error?.message
      : undefined;
    throw new Error(errorMessage || `Token refresh failed: ${response.status}`);
  }

  const jsonData: unknown = await response.json();
  const parseResult = LongLivedTokenResponseSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new Error(
      `Invalid token refresh response: ${parseResult.error.message}`,
    );
  }

  return {
    accessToken: parseResult.data.access_token,
    expiresIn: parseResult.data.expires_in,
  };
}

// =============================================================================
// User Info Functions
// =============================================================================

/**
 * Instagramユーザー情報を取得
 *
 * @param accessToken - Instagram Basic Display APIアクセストークン
 * @returns ユーザー情報
 */
export async function fetchInstagramUserInfo(
  accessToken: string,
): Promise<InstagramUserInfo> {
  const url = new URL(`${INSTAGRAM_GRAPH_API_BASE}/me`);
  url.searchParams.set("fields", "id,username,account_type,media_count");
  url.searchParams.set("access_token", accessToken);

  const response = await fetch(url.toString());

  if (!response.ok) {
    const errorResult = InstagramApiErrorSchema.safeParse(
      await response.json(),
    );
    const errorMessage = errorResult.success
      ? errorResult.data.error?.message
      : undefined;
    throw new Error(
      errorMessage || `IconUser info fetch failed: ${response.status}`,
    );
  }

  const jsonData: unknown = await response.json();
  const parseResult = InstagramApiUserResponseSchema.safeParse(jsonData);

  if (!parseResult.success) {
    throw new Error(`Invalid user info response: ${parseResult.error.message}`);
  }

  return omitUndefined({
    id: parseResult.data.id,
    username: parseResult.data.username,
    accountType: parseResult.data.account_type,
    mediaCount: parseResult.data.media_count,
  });
}

// =============================================================================
// Connection Test
// =============================================================================

/**
 * Instagram接続をテスト
 *
 * @param accessToken - Instagram Basic Display APIアクセストークン
 * @returns テスト結果
 */
export async function testInstagramConnection(
  accessToken: string,
): Promise<ApiKeyTestResult> {
  if (!isValidInstagramToken(accessToken)) {
    return {
      success: false,
      error: "トークンの形式が正しくありません",
    };
  }

  try {
    const userInfo = await fetchInstagramUserInfo(accessToken);

    return {
      success: true,
      message: `@${userInfo.username} として接続されています`,
      metadata: {
        userId: userInfo.id,
        username: userInfo.username,
        accountType: userInfo.accountType,
        mediaCount: userInfo.mediaCount,
      },
    };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "接続テストに失敗しました";

    // よくあるエラーパターンをユーザーフレンドリーに変換
    if (message.includes("Invalid OAuth access token")) {
      return {
        success: false,
        error:
          "アクセストークンが無効です。トークンの有効期限が切れている可能性があります",
      };
    }

    if (message.includes("Error validating access token")) {
      return {
        success: false,
        error: "トークンの検証に失敗しました。再認証が必要です",
      };
    }

    return {
      success: false,
      error: message,
    };
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * Instagramトークンをマスク表示用に変換
 */
export function maskInstagramToken(token: string): string {
  return maskApiKey(token, 8, 4);
}

/**
 * トークンの有効期限までの残り日数を計算
 */
export function getTokenExpiryDays(expiresAt: Date): number {
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / (1000 * 60 * 60 * 24)));
}

/**
 * トークンがリフレッシュ必要かどうかを判定
 * 有効期限の7日前からリフレッシュ推奨
 */
export function shouldRefreshToken(expiresAt: Date): boolean {
  const daysRemaining = getTokenExpiryDays(expiresAt);
  return daysRemaining <= 7;
}
