/**
 * Google API 共通 exponential backoff リトライヘルパー（SSoT）
 *
 * googleapis SDK (Calendar / Business Profile / Drive 等) と
 * `@google-analytics/data` 等の周辺クライアントに共通で適用する。
 *
 * ## Google 公式準拠
 * - 429 (rate limit) / 500 (internal error) / 503 (unavailable) は
 *   exponential backoff + jitter で再試行
 * - 403 でも `reason` が `rateLimitExceeded` / `userRateLimitExceeded` /
 *   `quotaExceeded` の場合は 429 と機能的に同等で同じく再試行
 *   （公式: "rateLimitExceeded errors can return either 403 or 429 error codes
 *    —functionally similar and should be responded to in the same way"）
 * - それ以外の 400 / 401 / 403 / 404 / 410 は即時失敗（回復不能 or 意味が異なる）
 * - ネットワーク層の一時エラー (`ECONNRESET` 等) も再試行対象
 *
 * @see https://developers.google.com/calendar/api/guides/errors
 * @see https://developers.google.com/calendar/api/guides/quota
 * @see https://developers.google.com/my-business/content/basic-setup
 * @see https://cloud.google.com/apis/design/errors#retrying_errors
 * @module shared/lib/google-api/retry
 */

import "server-only";

import { isRecord } from "@/shared/lib/serialize";

/** 再試行対象の HTTP ステータスコード（reason に関わらず常に retry） */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([429, 500, 503]);

/**
 * 403 で retry 対象となる Google API エラー reason。
 * これ以外の 403（`forbidden` 等）は認可エラーなので即失敗にする。
 */
const RETRYABLE_403_REASONS: ReadonlySet<string> = new Set([
  "rateLimitExceeded",
  "userRateLimitExceeded",
  "quotaExceeded",
]);

/** ネットワーク層の一時的エラーコード（Node / undici / pg 互換） */
const RETRYABLE_SYSTEM_ERRORS: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
]);

/** デフォルト最大リトライ回数（公式推奨: 3-5） */
const DEFAULT_MAX_RETRIES = 3;

/** 初期バックオフ（ms）。実際の待機は `INITIAL_BACKOFF_MS * 2^attempt + jitter` */
const INITIAL_BACKOFF_MS = 1000;

/**
 * エラーオブジェクトから HTTP ステータスコードを抽出する。
 *
 * GaxiosError は `code` プロパティ（number or string）または `response.status` を持つ。
 * `error.code` は string の場合がある（ネットワークエラー時）ので型を丁寧に判定する。
 */
function extractStatusCode(error: unknown): number | null {
  if (!isRecord(error)) return null;
  const code = error["code"];
  if (typeof code === "number") return code;
  const status = error["status"];
  if (typeof status === "number") return status;
  const response = error["response"];
  if (isRecord(response) && typeof response["status"] === "number") {
    return response["status"];
  }
  return null;
}

/**
 * エラーオブジェクトから system error code（`ECONNRESET` 等）を抽出する。
 */
function extractSystemErrorCode(error: unknown): string | null {
  if (!isRecord(error)) return null;
  const code = error["code"];
  return typeof code === "string" ? code : null;
}

/**
 * Google API の構造化エラーから最初の `reason` 文字列を抽出する。
 *
 * GaxiosError の response.data は以下の形式:
 * ```
 * { error: { code: 403, message: "...", errors: [{ domain: "usageLimits", reason: "rateLimitExceeded", ... }] } }
 * ```
 */
export function extractFirstErrorReason(error: unknown): string | null {
  if (!isRecord(error)) return null;

  const directFirst = Array.isArray(error["errors"])
    ? error["errors"][0]
    : undefined;
  if (isRecord(directFirst) && typeof directFirst["reason"] === "string") {
    return directFirst["reason"];
  }

  const response = error["response"];
  const data = isRecord(response) ? response["data"] : undefined;
  const responseError = isRecord(data) ? data["error"] : undefined;
  const nestedErrors = isRecord(responseError)
    ? responseError["errors"]
    : undefined;
  const nestedFirst = Array.isArray(nestedErrors) ? nestedErrors[0] : undefined;
  if (isRecord(nestedFirst) && typeof nestedFirst["reason"] === "string") {
    return nestedFirst["reason"];
  }

  return null;
}

/**
 * エラーが retry 対象かを判定する。
 *
 * 判定順:
 * 1. HTTP status が 429 / 500 / 503 → retry
 * 2. HTTP status が 403 かつ reason が usageLimits 系 → retry（公式推奨）
 * 3. system error code が一時的な network エラー → retry
 */
export function isRetryableGoogleApiError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status !== null && RETRYABLE_STATUS_CODES.has(status)) return true;

  if (status === 403) {
    const reason = extractFirstErrorReason(error);
    if (reason !== null && RETRYABLE_403_REASONS.has(reason)) return true;
  }

  const sysCode = extractSystemErrorCode(error);
  if (sysCode !== null && RETRYABLE_SYSTEM_ERRORS.has(sysCode)) return true;

  return false;
}

function backoffMs(attempt: number): number {
  const base = INITIAL_BACKOFF_MS * 2 ** attempt;
  const jitter = Math.random() * 200;
  return base + jitter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export type RetryOptions = {
  /** 最大リトライ回数（デフォルト 3） */
  maxRetries?: number;
  /** 特定のエラーを retry 対象として追加判定するコールバック */
  shouldRetry?: (error: unknown) => boolean;
};

/**
 * Google API 呼び出しを exponential backoff retry でラップする。
 *
 * @example
 * ```ts
 * const response = await withGoogleApiRetry(() =>
 *   client.events.insert({ calendarId, requestBody: event }),
 * );
 * ```
 */
export async function withGoogleApiRetry<T>(
  fn: () => Promise<T>,
  options?: RetryOptions,
): Promise<T> {
  const maxRetries = options?.maxRetries ?? DEFAULT_MAX_RETRIES;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      if (attempt >= maxRetries) throw error;

      const retryable =
        isRetryableGoogleApiError(error) ||
        (options?.shouldRetry?.(error) ?? false);
      if (!retryable) throw error;

      await sleep(backoffMs(attempt));
    }
  }

  // Unreachable
  throw new Error("withGoogleApiRetry: retry loop exited unexpectedly");
}
