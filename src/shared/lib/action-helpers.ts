/**
 * Server Action ヘルパー関数
 *
 * バリデーションエラー抽出、Turnstile検証の共通処理を提供
 */

import type { ZodError, ZodSchema } from 'zod'
import { verifyTurnstileToken, isTurnstileEnabled } from './turnstile'
import type { ActionFailure } from '@/admin/types/server-actions'

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
 * @returns 検証結果
 */
export async function validateTurnstile(
  token?: string
): Promise<TurnstileResult> {
  if (!isTurnstileEnabled()) {
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
