/**
 * Instagram API Utilities
 *
 * Instagram Graph API / Basic Display API を使用した機能群。
 * トークン管理、フィード取得、oEmbed取得などのユーティリティ。
 *
 * ## 設計方針
 * - `InstagramApiError`（→ `./retry`）で構造化エラーを throw
 * - read / refresh 系は `withInstagramApiRetry` で 429 / 5xx / Graph API transient code を retry
 * - `exchangeCodeForToken` は authorization code が 1 回限り消費のため retry なし
 * - レスポンスは全て Zod safeParse で検証
 *
 * @module shared/lib/instagram
 */

import "server-only";

import { z } from "zod";
import type { ApiKeyTestResult } from "@/shared/types/api-keys";
import { isValidInstagramToken } from "@/shared/lib/validations/instagram";
import { MS_PER_DAY } from "@/shared/lib/date-format";
import { omitUndefined } from "@/shared/lib/serialize";
import { InstagramApiError, withInstagramApiRetry } from "./retry";

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
  // Instagram API は id の一意性を保証するが、防御的に重複を除去する
  // （React key の stable ID として使われるため）
  data: z.array(InstagramApiMediaSchema).transform((items) => {
    const seen = new Set<string>();
    return items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
  }),
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
// Core fetch helper（構造化エラー throw + Zod 検証）
// =============================================================================

/**
 * Instagram Graph API に対する fetch を構造化エラー対応で実行する。
 *
 * - 非 OK レスポンスは `InstagramApiError` を throw（status / graphApiCode / type を保持）
 * - 成功時は Zod schema で response を検証
 *
 * `withInstagramApiRetry` でラップして使用する。
 */
async function callInstagramApi<T>(
  url: string,
  init: RequestInit | undefined,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(url, init);

  if (!response.ok) {
    const rawError: unknown = await response.json().catch(() => null);
    const parsed = InstagramApiErrorSchema.safeParse(rawError);
    const graphError = parsed.success ? parsed.data.error : undefined;
    throw new InstagramApiError(
      response.status,
      graphError?.code ?? null,
      graphError?.type ?? null,
      graphError?.message ?? `Instagram API error: ${response.status}`,
    );
  }

  const rawData: unknown = await response.json();
  const result = schema.safeParse(rawData);
  if (!result.success) {
    throw new Error(`Invalid Instagram API response: ${result.error.message}`);
  }
  return result.data;
}

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

  const data = await withInstagramApiRetry(() =>
    callInstagramApi(url.toString(), undefined, InstagramApiFeedResponseSchema),
  );

  return data.data.map((item) =>
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

  const data = await withInstagramApiRetry(() =>
    callInstagramApi(
      url.toString(),
      undefined,
      InstagramOembedApiResponseSchema,
    ),
  );

  return omitUndefined({
    html: data.html,
    width: data.width,
    height: data.height,
    authorName: data.author_name,
    providerName: data.provider_name,
  });
}

// =============================================================================
// OAuth Token Exchange Functions
// =============================================================================

/**
 * 認証コードを短期トークンに交換
 *
 * **注意**: authorization code は 1 回限り消費されるため retry しない。
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
  const data = await callInstagramApi(
    `${INSTAGRAM_OAUTH_BASE}/access_token`,
    {
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
    },
    ExchangeTokenResponseSchema,
  );

  return {
    accessToken: data.access_token,
    userId: String(data.user_id),
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

  const data = await withInstagramApiRetry(() =>
    callInstagramApi(url.toString(), undefined, LongLivedTokenResponseSchema),
  );

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in, // 秒単位（通常60日）
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

  const data = await withInstagramApiRetry(() =>
    callInstagramApi(url.toString(), undefined, LongLivedTokenResponseSchema),
  );

  return {
    accessToken: data.access_token,
    expiresIn: data.expires_in,
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

  const data = await withInstagramApiRetry(() =>
    callInstagramApi(url.toString(), undefined, InstagramApiUserResponseSchema),
  );

  return omitUndefined({
    id: data.id,
    username: data.username,
    accountType: data.account_type,
    mediaCount: data.media_count,
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
    // Graph API error code 190 = OAUTH_ACCESS_TOKEN_INVALID
    if (error instanceof InstagramApiError && error.graphApiCode === 190) {
      return {
        success: false,
        error:
          "アクセストークンが無効です。トークンの有効期限が切れている可能性があります",
      };
    }

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
 * トークンの有効期限までの残り日数を計算
 */
export function getTokenExpiryDays(expiresAt: Date): number {
  const now = new Date();
  const diffMs = expiresAt.getTime() - now.getTime();
  return Math.max(0, Math.floor(diffMs / MS_PER_DAY));
}

/**
 * トークンがリフレッシュ必要かどうかを判定
 * 有効期限の7日前からリフレッシュ推奨
 */
export function shouldRefreshToken(expiresAt: Date): boolean {
  const daysRemaining = getTokenExpiryDays(expiresAt);
  return daysRemaining <= 7;
}

// Re-export 構造化エラー（外部 consumer 用）
export { InstagramApiError, withInstagramApiRetry };
