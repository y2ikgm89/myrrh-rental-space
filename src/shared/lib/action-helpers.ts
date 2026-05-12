/**
 * Server Action ヘルパー関数
 *
 * バリデーションエラー抽出、Turnstile検証の共通処理を提供します。
 * Server Actionsで共通的に必要となるユーティリティ関数をまとめています。
 *
 * ## 提供機能
 * - **Zodエラー変換**: ZodErrorをフィールドエラーマップに変換
 * - **Turnstile検証**: ボット対策の検証フロー
 * - **リトライ機構**: 一時的な障害に対する指数バックオフリトライ
 *
 * @module shared/lib/action-helpers
 */

import type { ZodError } from "zod";
import { verifyTurnstileToken, isTurnstileEnabled } from "./turnstile";
import type { TurnstileAction } from "./turnstile-actions";
import { getClientIpFromHeaders } from "./rate-limit";
import type { MutationError } from "@/shared/lib/mutation-result";

/**
 * ZodErrorをフィールドエラーマップに変換
 *
 * @param error - ZodError
 * @returns フィールド名をキーとするエラーメッセージ配列
 *
 * @example
 * const result = schema.safeParse(data)
 * if (!result.success) {
 *   const fieldErrors = extractFieldErrors(result.error)
 * }
 */
export function extractFieldErrors(error: ZodError): Record<string, string[]> {
  const fieldErrors: Record<string, string[]> = {};

  for (const issue of error.issues) {
    const field = issue.path[0];
    if (typeof field === "string") {
      fieldErrors[field] ??= [];
      fieldErrors[field].push(issue.message);
    }
  }

  return fieldErrors;
}

/**
 * ZodErrorをMutationErrorに直接変換
 *
 * @param error - ZodError
 * @param message - ユーザー向けエラーメッセージ
 */
export function createValidationMutationError(
  error: ZodError,
  message = "入力内容に誤りがあります",
): MutationError {
  return {
    error: message,
    code: "VALIDATION",
    fieldErrors: extractFieldErrors(error),
  };
}

/**
 * Turnstile 検証結果
 */
export type TurnstileResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string };

export type ValidateTurnstileParams = {
  readonly token: string | undefined;
  readonly expectedAction: TurnstileAction;
};

/**
 * Turnstile 検証の共通フロー（公式推奨の action binding + remoteip + idempotency key）
 *
 * 呼び出し側は `expectedAction` を TURNSTILE_ACTIONS から指定するだけでよい。
 * `remoteip` は `getClientIpFromHeaders()` で自動取得（Server Actions / Route Handlers /
 * Better Auth hook すべてで動作）。
 *
 * Settings テーブルに site/secret key が未設定の場合は検証をスキップ（dev フレンドリー）。
 * 本番で secret 未設定は `verifyTurnstileToken` 側で拒否される。
 */
export async function validateTurnstile(
  params: ValidateTurnstileParams,
): Promise<TurnstileResult> {
  if (!(await isTurnstileEnabled())) {
    return { success: true };
  }

  if (!params.token) {
    return {
      success: false,
      error: "セキュリティ検証が必要です。ページを再読み込みしてください。",
    };
  }

  const result = await verifyTurnstileToken({
    token: params.token,
    expectedAction: params.expectedAction,
    remoteip: await getClientIpFromHeaders(),
  });

  if (!result.success) {
    return {
      success: false,
      error:
        "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。",
    };
  }

  return { success: true };
}

// =============================================================================
// Rate Limiting for Server Actions
// =============================================================================

type RateLimitCheckResult =
  | { success: true }
  | { success: false; error: string };

/**
 * Server Action 内でレート制限を適用
 *
 * @param limiter - createRateLimiter で作成したレートリミッター
 * @returns レート制限結果。超過時はエラーメッセージを返す
 *
 * @example
 * const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
 * if (!rateLimit.success) return createMutationError(rateLimit.error);
 */
export async function checkActionRateLimit(limiter: {
  check(token: string): Promise<{ success: boolean }>;
}): Promise<RateLimitCheckResult> {
  const { getClientIpFromHeaders } = await import("./rate-limit");
  const ip = await getClientIpFromHeaders();
  const result = await limiter.check(ip);
  if (!result.success) {
    return {
      success: false,
      error: "リクエストが多すぎます。しばらく経ってから再度お試しください。",
    };
  }
  return { success: true };
}

// =============================================================================
// Retry Utilities
// =============================================================================

/**
 * リトライオプション
 */
export type RetryOptions = {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number;
  /** 初期遅延（ミリ秒、デフォルト: 100） */
  initialDelayMs?: number;
  /** 最大遅延（ミリ秒、デフォルト: 5000） */
  maxDelayMs?: number;
  /** リトライ対象のエラー判定（デフォルト: 全てのエラー） */
  shouldRetry?: (error: unknown) => boolean;
};

/**
 * 一時的な障害かどうかを判定
 *
 * Prisma/データベースの接続エラー、ネットワークエラーなどを判定
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;

  const message = error.message.toLowerCase();
  const transientPatterns = [
    "connection",
    "timeout",
    "econnreset",
    "econnrefused",
    "socket",
    "network",
    "temporarily unavailable",
    "too many connections",
    "deadlock",
  ];

  return transientPatterns.some((pattern) => message.includes(pattern));
}

/**
 * 指数バックオフでリトライを実行
 *
 * @param fn - リトライする非同期関数
 * @param options - リトライオプション
 * @returns 関数の実行結果
 * @throws 最大リトライ回数を超えた場合、最後のエラーをスロー
 *
 * @example
 * const result = await withRetry(
 *   () => prisma.user.create({ data }),
 *   { maxRetries: 3, shouldRetry: isTransientError }
 * )
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = () => true,
  } = options;

  let lastError: unknown;
  let delay = initialDelayMs;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // 最後の試行、またはリトライ対象外のエラー
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error;
      }

      // 指数バックオフ + ジッター
      const jitter = Math.random() * delay * 0.1;
      await new Promise((resolve) => setTimeout(resolve, delay + jitter));
      delay = Math.min(delay * 2, maxDelayMs);
    }
  }

  throw lastError;
}
