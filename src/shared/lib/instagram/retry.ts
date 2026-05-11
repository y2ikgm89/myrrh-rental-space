/**
 * Instagram Graph API / Basic Display API 共通 retry ヘルパー（SSoT）
 *
 * Meta 公式準拠（https://developers.facebook.com/docs/graph-api/guides/error-handling）:
 * - HTTP 429 / 500 / 502 / 503 / 504 は exponential backoff + jitter で retry
 * - Graph API error subcode（`error.code`）が transient（1 / 2 / 4 / 17 / 32 / 613）の場合 retry
 * - それ以外（190 Invalid OAuth Token / 100 Invalid Parameter / 200 Permissions 等）は即時失敗
 * - ネットワーク層の一時エラー (`ECONNRESET` 等) も retry 対象
 *
 * ## Graph API error code reference
 * | code | 名前                            | 挙動                              |
 * | ---- | ------------------------------- | --------------------------------- |
 * | 1    | API_UNKNOWN                     | transient → retry                 |
 * | 2    | API_SERVICE                     | transient → retry                 |
 * | 4    | API_TOO_MANY_CALLS              | App Rate Limit → retry            |
 * | 17   | API_USER_TOO_MANY_CALLS         | User Rate Limit → retry           |
 * | 32   | PAGE_LEVEL_THROTTLING           | retry                             |
 * | 613  | CALLS_EXCEEDED_RATE_LIMIT       | Business Use Case Rate → retry    |
 * | 190  | OAUTH_ACCESS_TOKEN_INVALID      | 認証エラー → 即時失敗             |
 * | 100  | INVALID_PARAMETER               | バリデーション → 即時失敗         |
 *
 * @see https://developers.facebook.com/docs/graph-api/overview/rate-limiting
 * @see https://developers.facebook.com/docs/graph-api/guides/error-handling
 * @module shared/lib/instagram/retry
 */

import "server-only";

/** 再試行対象の HTTP ステータスコード */
const RETRYABLE_STATUS_CODES: ReadonlySet<number> = new Set([
  429, 500, 502, 503, 504,
]);

/** 再試行対象の Graph API error.code（transient / rate limit） */
const RETRYABLE_GRAPH_API_CODES: ReadonlySet<number> = new Set([
  1, 2, 4, 17, 32, 613,
]);

/** ネットワーク層の一時的エラーコード */
const RETRYABLE_SYSTEM_ERRORS: ReadonlySet<string> = new Set([
  "ECONNRESET",
  "ETIMEDOUT",
  "EAI_AGAIN",
  "ENOTFOUND",
  "ECONNREFUSED",
]);

/** デフォルト最大リトライ回数（公式推奨: 3-5） */
const DEFAULT_MAX_RETRIES = 3;

/** 初期バックオフ（ms） */
const INITIAL_BACKOFF_MS = 1000;

/**
 * Instagram Graph API のエラーレスポンスを表現する構造化エラー。
 *
 * `fetch` 直 throw の汎用 `Error` ではなく本クラスで wrap することで、
 * retry 判定（`error.statusCode` / `error.graphApiCode`）が型安全に行える。
 */
export class InstagramApiError extends Error {
  override readonly name = "InstagramApiError";
  /** HTTP ステータスコード（fetch 失敗時は 0） */
  readonly statusCode: number;
  /** Graph API error.code（取得できない場合は null） */
  readonly graphApiCode: number | null;
  /** Graph API error.type（取得できない場合は null） */
  readonly graphApiType: string | null;

  constructor(
    statusCode: number,
    graphApiCode: number | null,
    graphApiType: string | null,
    message: string,
  ) {
    super(message);
    this.statusCode = statusCode;
    this.graphApiCode = graphApiCode;
    this.graphApiType = graphApiType;
  }
}

/**
 * エラーが retry 対象かを判定する。
 *
 * 判定順:
 * 1. `InstagramApiError`: statusCode が 429 / 5xx → retry
 * 2. `InstagramApiError`: graphApiCode が transient/rate-limit 系 → retry
 * 3. system error code が一時的な network エラー → retry
 */
export function isRetryableInstagramApiError(error: unknown): boolean {
  if (error instanceof InstagramApiError) {
    if (RETRYABLE_STATUS_CODES.has(error.statusCode)) return true;
    if (
      error.graphApiCode !== null &&
      RETRYABLE_GRAPH_API_CODES.has(error.graphApiCode)
    ) {
      return true;
    }
    return false;
  }

  if (!error || typeof error !== "object") return false;
  const err = error as { code?: string };
  if (typeof err.code === "string" && RETRYABLE_SYSTEM_ERRORS.has(err.code)) {
    return true;
  }
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
 * Instagram Graph API 呼び出しを exponential backoff retry でラップする。
 *
 * @example
 * ```ts
 * const feed = await withInstagramApiRetry(() => callInstagramApi(...));
 * ```
 */
export async function withInstagramApiRetry<T>(
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
        isRetryableInstagramApiError(error) ||
        (options?.shouldRetry?.(error) ?? false);
      if (!retryable) throw error;

      await sleep(backoffMs(attempt));
    }
  }

  // Unreachable
  throw new Error("withInstagramApiRetry: retry loop exited unexpectedly");
}
