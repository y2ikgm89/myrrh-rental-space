/**
 * Google Calendar API 呼び出しの exponential backoff リトライヘルパー
 *
 * Google 公式推奨: 429 (rate limit) / 500 (internal error) / 503 (unavailable) は
 * exponential backoff + jitter で再試行する。
 * 400 / 401 / 403 / 404 / 410 は即時失敗扱い（回復不能 or 意味が異なる）。
 *
 * @see https://developers.google.com/calendar/api/guides/errors
 * @see https://cloud.google.com/apis/design/errors#retrying_errors
 */

import "server-only";

/** 再試行対象の HTTP ステータスコード */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([429, 500, 503]);

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
  if (!error || typeof error !== "object") return null;
  const err = error as {
    code?: number | string;
    status?: number;
    response?: { status?: number };
  };
  if (typeof err.code === "number") return err.code;
  if (typeof err.status === "number") return err.status;
  if (typeof err.response?.status === "number") return err.response.status;
  return null;
}

/**
 * エラーオブジェクトから system error code（`ECONNRESET` 等）を抽出する。
 */
function extractSystemErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const err = error as { code?: number | string };
  return typeof err.code === "string" ? err.code : null;
}

/**
 * エラーが retry 対象かを判定する。
 */
export function isRetryableGoogleApiError(error: unknown): boolean {
  const status = extractStatusCode(error);
  if (status !== null && RETRYABLE_STATUS_CODES.has(status)) return true;

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
