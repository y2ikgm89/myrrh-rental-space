/**
 * Server Actions 共通型定義
 *
 * 全てのServer ActionはActionResult<T>を返す
 */

import { getSession, type User } from '@/lib/auth'
import { Role } from '@/generated/prisma/client/enums'

// =============================================================================
// Types
// =============================================================================

/**
 * Server Actionsの成功レスポンス
 */
export type ActionSuccess<TData = void> = TData extends void
  ? {
      success: true
      message: string
    }
  : {
      success: true
      message: string
      data: TData
    }

/**
 * Server Actionsの失敗レスポンス
 */
export type ActionFailure = {
  success: false
  error: string
  fieldErrors?: Record<string, string[]>
}

/**
 * Server Actionsの統一レスポンス型
 *
 * @example
 * // データなし
 * ActionResult<void>
 *
 * // 単一エンティティ
 * ActionResult<{ id: string }>
 *
 * // リスト
 * ActionResult<{ items: Space[]; total: number }>
 */
export type ActionResult<TData = void> = ActionSuccess<TData> | ActionFailure

// =============================================================================
// Helpers
// =============================================================================

/**
 * 成功レスポンスを生成
 *
 * @example
 * return createSuccess('保存しました')
 * return createSuccess('作成しました', { id: '123' })
 */
export function createSuccess(message: string): ActionSuccess<void>
export function createSuccess<T>(message: string, data: T): ActionSuccess<T>
export function createSuccess<T>(
  message: string,
  data?: T
): ActionSuccess<T> | ActionSuccess<void> {
  if (data === undefined) {
    // TypeScript cannot narrow the conditional type based on runtime check
    return { success: true, message } as ActionSuccess<void>
  }
  return { success: true, message, data } as ActionSuccess<T>
}

/**
 * 失敗レスポンスを生成
 *
 * @example
 * return createFailure('エラーが発生しました')
 * return createFailure('検証エラー', { email: ['無効なメールアドレス'] })
 */
export function createFailure(
  error: string,
  fieldErrors?: Record<string, string[]>
): ActionFailure {
  return fieldErrors
    ? { success: false, error, fieldErrors }
    : { success: false, error }
}

/**
 * 成功判定ヘルパー
 */
export function isActionSuccess<T>(
  result: ActionResult<T>
): result is ActionSuccess<T> {
  return result.success === true
}

/**
 * 失敗判定ヘルパー
 */
export function isActionFailure<T>(
  result: ActionResult<T>
): result is ActionFailure {
  return result.success === false
}

// =============================================================================
// withAuth Higher Order Function
// =============================================================================

/**
 * 管理者認証が必要なServer Actionをラップする高階関数
 *
 * - 認証エラー時は自動的にActionFailureを返す
 * - 成功時はコールバック関数にuserを渡して実行
 * - try-catch不要で認証処理を統一
 *
 * @example
 * // 書き込み操作
 * export const updateUser = withAuth(async (user, id: string, data: UserInput) => {
 *   // userは認証済み管理者
 *   await prisma.user.update({ where: { id }, data })
 *   return createSuccess('更新しました')
 * })
 *
 * @example
 * // データ付き成功レスポンス
 * export const createUser = withAuth(async (user, data: UserInput) => {
 *   const newUser = await prisma.user.create({ data })
 *   return createSuccess('作成しました', { id: newUser.id })
 * })
 */
export function withAuth<TArgs extends unknown[], TData = void>(
  fn: (user: User, ...args: TArgs) => Promise<ActionResult<TData>>
): (...args: TArgs) => Promise<ActionResult<TData>> {
  return async (...args: TArgs): Promise<ActionResult<TData>> => {
    const session = await getSession()

    if (!session?.user) {
      return createFailure('ログインが必要です')
    }

    if (session.user.role !== Role.ADMIN) {
      return createFailure('管理者権限が必要です')
    }

    return await fn(session.user as User, ...args)
  }
}
