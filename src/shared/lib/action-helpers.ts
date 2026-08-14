/**
 * Server Action ヘルパー関数
 *
 * バリデーションエラー抽出、ボット対策ヒューリスティック、リトライ機構を提供します。
 * Turnstile 検証は `shared/domain/settings/turnstile` を参照。
 *
 * @module shared/lib/action-helpers
 */

import "server-only";
import { readFormRenderElapsedMs } from "@/shared/lib/tokens/form-render-token";
import type { ZodError } from "zod";
import { normalizeEmailForIdentity } from "./email/normalize-email";
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

// =============================================================================
// Bot Heuristics for Server Actions (honeypot + submission-timing trap)
// =============================================================================

export type BotCheckResult =
  | { readonly success: true }
  | { readonly success: false; readonly error: string };

/**
 * honeypot が埋まっている、またはフォーム表示から極端に短時間(3秒未満)で
 * 送信された場合に bot と判定する。理由をエラーメッセージで開示しない
 * （回避策のヒントを与えないため、Turnstile 失敗時と同じ汎用文言を使う）。
 */
const MIN_FORM_FILL_TIME_MS = 3000;
const BOT_DETECTED_ERROR =
  "セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。";

/**
 * @param formRenderToken サーバーが発行した purpose 付きトークン（監査 F-71）。
 *   **クライアントの `Date.now()` は使わない。** 端末の時計が進んでいると
 *   「サーバー時刻 − クライアント時刻」が負になり、実際に 2 分かけて入力した
 *   利用者が必ず bot 判定で拒否されていた（押し直しても同じ）。逆に遅れている
 *   端末では差が過大になり、時間トラップが常に素通りする。
 */
export function checkBotHeuristics(params: {
  readonly honeypot: string | undefined;
  readonly formRenderToken: string | undefined;
}): BotCheckResult {
  if (params.honeypot) {
    return { success: false, error: BOT_DETECTED_ERROR };
  }

  if (params.formRenderToken !== undefined) {
    const elapsedMs = readFormRenderElapsedMs(params.formRenderToken);
    // `null` は復号失敗・期限切れ・形式不正＝**判定不能**。bot 扱いにはしない。
    // 時間トラップの目的は速すぎる送信を弾くことで、遅い送信ではない。
    if (elapsedMs !== null && elapsedMs < MIN_FORM_FILL_TIME_MS) {
      return { success: false, error: BOT_DETECTED_ERROR };
    }
  }

  return { success: true };
}

// =============================================================================
// Rate Limiting for Server Actions
// =============================================================================

type RateLimitCheckResult =
  { success: true } | { success: false; error: string };

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

/**
 * 顧客(メールアドレス)単位でレート制限を適用する第二防壁。
 *
 * IP単位の `checkActionRateLimit` だけだと、同一人物が複数IP/複数ブラウザから
 * 同じメールアドレスで大量作成を試みるケースを防げない。emailを
 * `normalizeEmailForIdentity` で正規化してtokenにすることで、大文字小文字・
 * 前後空白の違いによる回避を防ぐ（`cancelByReservationRateLimiter` と同型の
 * 「resource/identity単位の追加バケット」設計）。
 *
 * @example
 * const emailLimit = await checkEmailRateLimit(reservationByEmailRateLimiter, data.email);
 * if (!emailLimit.success) return { ok: false, error: emailLimit.error };
 */
export async function checkEmailRateLimit(
  limiter: { check(token: string): Promise<{ success: boolean }> },
  email: string,
): Promise<RateLimitCheckResult> {
  const result = await limiter.check(normalizeEmailForIdentity(email));
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
