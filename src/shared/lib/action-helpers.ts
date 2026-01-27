/**
 * Server Action ヘルパー関数
 *
 * バリデーションエラー抽出、Turnstile検証の共通処理を提供します。
 * Server Actionsで共通的に必要となるユーティリティ関数をまとめています。
 *
 * ## 提供機能
 * - **Zodエラー変換**: ZodErrorをフィールドエラーマップに変換
 * - **Turnstile検証**: ボット対策の検証フロー
 * - **複合ラッパー**: Turnstile + Zodバリデーションの組み合わせ
 * - **リトライ機構**: 一時的な障害に対する指数バックオフリトライ
 *
 * @module shared/lib/action-helpers
 */

import type { ZodError, ZodSchema } from 'zod'
import { verifyTurnstileToken, isTurnstileEnabled } from './turnstile'
import type { ActionFailure } from '@/shared/types/server-actions'

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
  const fieldErrors: Record<string, string[]> = {}

  for (const issue of error.issues) {
    const field = issue.path[0]
    if (typeof field === 'string') {
      fieldErrors[field] ??= []
      fieldErrors[field].push(issue.message)
    }
  }

  return fieldErrors
}

/**
 * バリデーションエラーレスポンスを生成
 *
 * @param error - ZodError
 * @param message - ユーザー向けエラーメッセージ
 */
export function createValidationError(
  error: ZodError,
  message = '入力内容に誤りがあります'
): ActionFailure {
  return {
    success: false,
    error: message,
    fieldErrors: extractFieldErrors(error),
  }
}

/**
 * Turnstile検証結果
 */
type TurnstileResult =
  | { success: true }
  | { success: false; error: string }

/**
 * Turnstile検証の共通フロー
 *
 * @param token - クライアントから受け取ったトークン
 * @param options.skipEnabledCheck - trueの場合、isTurnstileEnabled()のチェックをスキップ
 *   （呼び出し元で既にチェック済みの場合に使用し、二重DBクエリを回避）
 * @returns 検証結果
 */
export async function validateTurnstile(
  token?: string,
  options?: { skipEnabledCheck?: boolean }
): Promise<TurnstileResult> {
  if (!options?.skipEnabledCheck && !(await isTurnstileEnabled())) {
    return { success: true }
  }

  if (!token) {
    return {
      success: false,
      error: 'セキュリティ検証が必要です。ページを再読み込みしてください。',
    }
  }

  const isValid = await verifyTurnstileToken(token)
  if (!isValid) {
    return {
      success: false,
      error:
        'セキュリティ検証に失敗しました。しばらく経ってから再度お試しください。',
    }
  }

  return { success: true }
}

/**
 * Turnstile検証付きでServer Actionを実行
 *
 * @param token - Turnstileトークン
 * @param handler - 検証成功後に実行する関数
 *
 * @example
 * export async function submitForm(data: FormData, token?: string) {
 *   return withTurnstile(token, async () => {
 *     // フォーム処理
 *   })
 * }
 */
export async function withTurnstile<T>(
  token: string | undefined,
  handler: () => Promise<T>
): Promise<T | ActionFailure> {
  const result = await validateTurnstile(token)

  if (!result.success) {
    return { success: false, error: result.error }
  }

  return handler()
}

/**
 * Zodバリデーション付きでServer Actionを実行
 *
 * @param schema - Zodスキーマ
 * @param input - 入力データ
 * @param handler - バリデーション成功後に実行する関数
 *
 * @example
 * export async function submitForm(input: unknown) {
 *   return withValidation(formSchema, input, async (data) => {
 *     // data は型安全
 *   })
 * }
 */
export async function withValidation<Input, Output>(
  schema: ZodSchema<Input>,
  input: unknown,
  handler: (data: Input) => Promise<Output>
): Promise<Output | ActionFailure> {
  const result = schema.safeParse(input)

  if (!result.success) {
    return createValidationError(result.error, 'バリデーションエラーが発生しました')
  }

  return handler(result.data)
}

/**
 * Turnstile + Zodバリデーション付きでServer Actionを実行
 *
 * @param token - Turnstileトークン
 * @param schema - Zodスキーマ
 * @param input - 入力データ
 * @param handler - 検証成功後に実行する関数
 *
 * @example
 * export async function submitContact(input: ContactInput, token?: string) {
 *   return withTurnstileAndValidation(token, contactSchema, input, async (data) => {
 *     const inquiry = await prisma.inquiry.create({ ... })
 *     return { success: true, message: '送信しました' }
 *   })
 * }
 */
export async function withTurnstileAndValidation<Input, Output>(
  token: string | undefined,
  schema: ZodSchema<Input>,
  input: unknown,
  handler: (data: Input) => Promise<Output>
): Promise<Output | ActionFailure> {
  // Turnstile検証
  const turnstileResult = await validateTurnstile(token)
  if (!turnstileResult.success) {
    return { success: false, error: turnstileResult.error }
  }

  // バリデーション + ハンドラ実行
  return withValidation(schema, input, handler)
}

// =============================================================================
// Retry Utilities
// =============================================================================

/**
 * リトライオプション
 */
export type RetryOptions = {
  /** 最大リトライ回数（デフォルト: 3） */
  maxRetries?: number
  /** 初期遅延（ミリ秒、デフォルト: 100） */
  initialDelayMs?: number
  /** 最大遅延（ミリ秒、デフォルト: 5000） */
  maxDelayMs?: number
  /** リトライ対象のエラー判定（デフォルト: 全てのエラー） */
  shouldRetry?: (error: unknown) => boolean
}

/**
 * 一時的な障害かどうかを判定
 *
 * Prisma/データベースの接続エラー、ネットワークエラーなどを判定
 */
export function isTransientError(error: unknown): boolean {
  if (!(error instanceof Error)) return false

  const message = error.message.toLowerCase()
  const transientPatterns = [
    'connection',
    'timeout',
    'econnreset',
    'econnrefused',
    'socket',
    'network',
    'temporarily unavailable',
    'too many connections',
    'deadlock',
  ]

  return transientPatterns.some((pattern) => message.includes(pattern))
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
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxRetries = 3,
    initialDelayMs = 100,
    maxDelayMs = 5000,
    shouldRetry = () => true,
  } = options

  let lastError: unknown
  let delay = initialDelayMs

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn()
    } catch (error) {
      lastError = error

      // 最後の試行、またはリトライ対象外のエラー
      if (attempt === maxRetries || !shouldRetry(error)) {
        throw error
      }

      // 指数バックオフ + ジッター
      const jitter = Math.random() * delay * 0.1
      await new Promise((resolve) => setTimeout(resolve, delay + jitter))
      delay = Math.min(delay * 2, maxDelayMs)
    }
  }

  throw lastError
}
