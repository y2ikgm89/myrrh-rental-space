/**
 * Server Actions 共通型定義
 *
 * admin/public両方で使用する基本的な型とヘルパー
 * admin固有の認可ロジック（withPermission, withRole等）は@/admin/types/server-actionsを使用
 */

// =============================================================================
// Types
// =============================================================================

/**
 * Server Actionsの成功レスポンス
 */
export type ActionSuccess<TData = void> = {
  readonly success: true
  readonly message: string
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type -- intersection identity: no additional properties when TData is void
} & (TData extends void ? {} : { readonly data: TData })

/**
 * Server Actionsの失敗レスポンス
 */
export type ActionFailure = {
  readonly success: false
  readonly error: string
  readonly fieldErrors?: Record<string, string[]>
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
export function createSuccess<T>(message: string, data?: T) {
  if (data === undefined) {
    return { success: true, message }
  }
  return { success: true, message, data }
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

/**
 * エラーメッセージ取得ヘルパー
 * 失敗時のエラー情報をType-safe に取得する
 */
export function getActionError<T>(result: ActionResult<T>): string | undefined {
  return isActionFailure(result) ? result.error : undefined
}
