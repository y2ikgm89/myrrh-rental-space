/**
 * Cloudflare CDN Cache Purge
 *
 * Cloudflare APIを使用したキャッシュパージ機能
 * 管理画面での設定（Zone ID, API Token）をDBから取得して使用
 */

import "server-only";
import { z } from "zod";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { getDecryptedCloudflareCredentials } from "@/shared/domain/settings/api-key-queries";
import { logger } from "./logger";
import { getBaseUrl } from "@/shared/lib/constants";

interface PurgeResult {
  success: boolean;
  error?: string | undefined;
  purgedFiles?: number;
}

// Cloudflare Zone ID: 32文字の16進数
const ZONE_ID_PATTERN = /^[a-f0-9]{32}$/i;

function isValidZoneId(zoneId: string): boolean {
  return ZONE_ID_PATTERN.test(zoneId);
}

// Cloudflare API レスポンスのZodスキーマ
const cloudflareApiResponseSchema = z.object({
  success: z.boolean(),
  errors: z
    .array(
      z.object({
        code: z.number(),
        message: z.string(),
      }),
    )
    .optional(),
});

async function getCloudflareCredentials(): Promise<{
  zoneId: string;
  apiToken: string;
} | null> {
  const credentials = await getDecryptedCloudflareCredentials();
  if (!credentials) {
    return null;
  }

  // Zone IDの形式検証
  if (!isValidZoneId(credentials.zoneId)) {
    logger.warn("Invalid Cloudflare Zone ID format");
    return null;
  }

  return {
    zoneId: credentials.zoneId,
    apiToken: credentials.apiToken,
  };
}

/** 公式推奨: 3-5 回の exponential backoff retry */
const PURGE_API_MAX_RETRIES = 3;

/** 初期バックオフ（ms）。実待機は `INITIAL_BACKOFF_MS * 2^attempt + jitter` */
const PURGE_API_INITIAL_BACKOFF_MS = 1000;

/** Retry-After header 上限（ms）。10 分以上は noop で諦める */
const PURGE_API_MAX_RETRY_AFTER_MS = 10 * 60 * 1000;

function purgeBackoffMs(attempt: number): number {
  const base = PURGE_API_INITIAL_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * 200;
  return base + jitter;
}

function parseRetryAfterMs(header: string | null): number | null {
  if (!header) return null;
  // RFC 7231: delta-seconds (数値) または HTTP-date 形式。本実装は delta-seconds のみ対応。
  const seconds = Number.parseInt(header, 10);
  if (!Number.isFinite(seconds) || seconds <= 0) return null;
  const ms = seconds * 1000;
  return Math.min(ms, PURGE_API_MAX_RETRY_AFTER_MS);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function callPurgeApi(
  zoneId: string,
  apiToken: string,
  body: Record<string, unknown>,
): Promise<PurgeResult> {
  // Zone IDの二重検証（防御的プログラミング）
  if (!isValidZoneId(zoneId)) {
    return { success: false, error: "Invalid Zone ID format" };
  }

  // URL APIを使用してSSRF対策（パスのエスケープ）
  const apiUrl = new URL(
    `/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`,
    "https://api.cloudflare.com",
  );

  for (let attempt = 0; attempt <= PURGE_API_MAX_RETRIES; attempt++) {
    try {
      const response = await fetch(apiUrl.toString(), {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(10000),
      });

      // 認証・認可エラーは retry しても回復しないため即時失敗
      if (response.status === 401 || response.status === 403) {
        return {
          success: false,
          error: "API認証エラー: トークンの権限を確認してください",
        };
      }

      // 429 / 5xx は exponential backoff で retry（Retry-After header があれば尊重）
      if (response.status === 429 || response.status >= 500) {
        if (attempt < PURGE_API_MAX_RETRIES) {
          const retryAfterMs = parseRetryAfterMs(
            response.headers.get("retry-after"),
          );
          await sleep(retryAfterMs ?? purgeBackoffMs(attempt));
          continue;
        }
        // 最終 attempt の失敗
        if (response.status === 429) {
          return {
            success: false,
            error: "レート制限エラー: しばらく待ってから再試行してください",
          };
        }
        return {
          success: false,
          error: "Cloudflare APIサーバーエラー: 後ほど再試行してください",
        };
      }

      // その他の non-OK は即時失敗（400 系の bad request 等）
      if (!response.ok) {
        return {
          success: false,
          error: `HTTPエラー: ${response.status}`,
        };
      }

      // レスポンスのJSON解析と型検証
      const rawData: unknown = await response.json();
      const parseResult = cloudflareApiResponseSchema.safeParse(rawData);

      if (!parseResult.success) {
        logger.warn("Invalid Cloudflare API response format", {
          error: parseResult.error.message,
        });
        return { success: false, error: "APIレスポンスの形式が不正です" };
      }

      const data = parseResult.data;

      if (data.success) {
        return { success: true };
      }

      const errorMessage =
        data.errors?.[0]?.message || "キャッシュパージに失敗しました";
      return { success: false, error: errorMessage };
    } catch (error) {
      // ネットワークエラー / timeout は retry 対象
      const isTimeout = error instanceof Error && error.name === "TimeoutError";
      const isNetworkError =
        error instanceof TypeError ||
        (error instanceof Error &&
          (error.message.includes("fetch failed") ||
            error.message.includes("ECONNRESET") ||
            error.message.includes("ETIMEDOUT")));

      if ((isTimeout || isNetworkError) && attempt < PURGE_API_MAX_RETRIES) {
        await sleep(purgeBackoffMs(attempt));
        continue;
      }

      if (isTimeout) {
        return { success: false, error: "タイムアウトしました" };
      }
      logError(
        error instanceof Error ? error : new Error("Cloudflare API error"),
        {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: "callPurgeApi" },
        },
      );
      return { success: false, error: "Cloudflare API接続に失敗しました" };
    }
  }

  // Unreachable
  return { success: false, error: "Cloudflare API接続に失敗しました" };
}

/** 指定したURLのキャッシュをパージ */
export async function purgeCloudflareCache(
  urls: string[],
): Promise<PurgeResult> {
  const credentials = await getCloudflareCredentials();

  if (!credentials) {
    // Cloudflare設定がない場合は何もしない（エラーにはしない）
    logger.debug("Cloudflare credentials not configured, skipping cache purge");
    return { success: true };
  }

  if (urls.length === 0) {
    return { success: true };
  }

  // Cloudflare APIは1リクエストあたり最大30URLまで
  const MAX_URLS_PER_REQUEST = 30;
  const batches: string[][] = [];

  for (let i = 0; i < urls.length; i += MAX_URLS_PER_REQUEST) {
    batches.push(urls.slice(i, i + MAX_URLS_PER_REQUEST));
  }

  // バッチを並列処理
  const results = await Promise.all(
    batches.map((batch) =>
      callPurgeApi(credentials.zoneId, credentials.apiToken, { files: batch }),
    ),
  );

  // 結果を集計
  let totalPurged = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const batch = batches[i];
    if (!result || !batch) continue;
    if (!result.success) {
      logger.warn("Cloudflare cache purge failed", {
        error: result.error,
        urls: batch,
        purgedBeforeFailure: totalPurged,
      });
      return {
        success: result.success,
        error: result.error,
        purgedFiles: totalPurged,
      };
    }
    totalPurged += batch.length;
  }

  logger.info("Cloudflare cache purged", { count: totalPurged });
  return { success: true, purgedFiles: totalPurged };
}

// ============================================================
// Plan-tier gate. Health probe (cache/health.ts) flips this to false when the
// canary purge_by_tags returns a plan-tier feature-unavailable error.
// purgeCloudflareCacheByTags consults the flag and falls back to
// purgeAllCloudflareCache for site-wide invalidation.
// ============================================================
let cloudflareTagPurgeEnabled = true;

export function setCloudflareTagPurgeEnabled(enabled: boolean): void {
  cloudflareTagPurgeEnabled = enabled;
}

export function isCloudflareTagPurgeEnabled(): boolean {
  return cloudflareTagPurgeEnabled;
}

// ============================================================
// Public-facing exports for health probe
// ============================================================

/**
 * Validated credentials accessor (same Zone ID regex check as runtime).
 * Public so the startup health probe can use the canonical validation path.
 */
export async function getCloudflareCredentialsValidated(): Promise<{
  zoneId: string;
  apiToken: string;
} | null> {
  return getCloudflareCredentials();
}

/**
 * Public wrapper of callPurgeApi for the health probe's canary call.
 * (callPurgeApi is module-internal; this is the only export point.)
 */
export async function callPurgeApiPublic(
  zoneId: string,
  apiToken: string,
  body: Record<string, unknown>,
): Promise<PurgeResult> {
  return callPurgeApi(zoneId, apiToken, body);
}

// ============================================================
// Whole-zone purge (kept as tag-purge fallback)
// ============================================================

export async function purgeAllCloudflareCache(): Promise<PurgeResult> {
  const credentials = await getCloudflareCredentials();
  if (!credentials) {
    logger.debug("Cloudflare credentials not configured, skipping cache purge");
    return { success: true };
  }
  const result = await callPurgeApi(credentials.zoneId, credentials.apiToken, {
    purge_everything: true,
  });
  if (result.success) {
    logger.info("Cloudflare cache purged (all)");
  } else {
    logger.warn("Cloudflare cache purge (all) failed", { error: result.error });
  }
  return result;
}

// ============================================================
// URL purge (Cloudflare's primary recommendation for per-detail surfaces)
// ============================================================

export async function purgeCloudflareByPaths(
  siteUrl: string,
  paths: string[],
): Promise<PurgeResult> {
  const urls = paths.map((path) => `${siteUrl}${path}`);
  return purgeCloudflareCache(urls);
}

/**
 * Typed thin wrapper for per-detail URL purge. Caller passes relative paths
 * like ['/blog/foo', '/spaces/bar']; we prepend getBaseUrl().
 */
export async function purgeCloudflareDetailUrls(
  paths: readonly string[],
): Promise<PurgeResult> {
  if (paths.length === 0) return { success: true };
  return purgeCloudflareByPaths(getBaseUrl(), paths.slice());
}

// ============================================================
// Tag purge (Cloudflare purge_by_tags). Chunked at 30 client-side
// (matches MAX_URLS_PER_REQUEST; a conservative implementation choice, NOT a
// Cloudflare-imposed per-request count limit — Cloudflare publishes per-tag
// 1024-char and aggregate 16 KB header limits, not a per-request tag count cap).
// ============================================================

const MAX_TAGS_PER_REQUEST = 30;

/**
 * Purge by Cache-Tag values. Falls back to purgeAllCloudflareCache when the
 * runtime flag indicates the plan doesn't support tag purge (set by the
 * startup health probe).
 */
export async function purgeCloudflareCacheByTags(
  tags: string[],
): Promise<PurgeResult> {
  const credentials = await getCloudflareCredentials();
  if (!credentials) {
    logger.debug(
      "Cloudflare credentials not configured, skipping cache tag purge",
    );
    return { success: true };
  }
  if (tags.length === 0) {
    return { success: true };
  }

  // Plan-tier fallback: degrade to purge_everything so site-wide invalidation
  // still happens, just less surgically.
  if (!cloudflareTagPurgeEnabled) {
    logger.info(
      "Cloudflare tag purge disabled (plan tier); falling back to purge_all",
      { tags },
    );
    return purgeAllCloudflareCache();
  }

  // Validate + dedupe per Cloudflare constraints
  const unique: string[] = [];
  const seen = new Set<string>();
  for (const t of tags) {
    if (typeof t !== "string" || t.length === 0 || t.length > 1024) continue;
    if (seen.has(t)) continue;
    seen.add(t);
    unique.push(t);
  }
  if (unique.length === 0) {
    return { success: false, error: "パージ対象タグが無効です" };
  }

  const batches: string[][] = [];
  for (let i = 0; i < unique.length; i += MAX_TAGS_PER_REQUEST) {
    batches.push(unique.slice(i, i + MAX_TAGS_PER_REQUEST));
  }

  const results = await Promise.all(
    batches.map((batch) =>
      callPurgeApi(credentials.zoneId, credentials.apiToken, { tags: batch }),
    ),
  );

  let totalPurged = 0;
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    const batch = batches[i];
    if (!result || !batch) continue;
    if (!result.success) {
      logger.warn("Cloudflare tag purge failed", {
        error: result.error,
        tags: batch,
        purgedBeforeFailure: totalPurged,
      });
      return {
        success: false,
        error: result.error,
        purgedFiles: totalPurged,
      };
    }
    totalPurged += batch.length;
  }

  logger.info("Cloudflare cache purged (by tags)", { count: totalPurged });
  return { success: true, purgedFiles: totalPurged };
}
