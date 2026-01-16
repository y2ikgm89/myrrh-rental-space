/**
 * Server Actions 共通型定義
 *
 * 全てのServer ActionはActionResult<T>を返す
 */

import { getSession, getSessionUser, type User } from '@/lib/auth'
import { Role, AuditAction } from '@/generated/prisma/client/enums'
import {
  hasPermission,
  userHasResourceAccess,
  canAccessAdmin,
  type Resource,
  type Action,
} from '@/lib/permissions'
import { logUserAction, logPermissionDenied, type AuditUser } from '@/lib/audit'

// Re-export AuditUser for external use
export type { AuditUser }

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
): { success: true; message: string } | { success: true; message: string; data: T } {
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
 * @deprecated withPermission または withRole を使用してください
 *
 * @example
 * // 書き込み操作
 * export const updateUser = withAuth(async (user, id: string, data: UserInput) => {
 *   // userは認証済み管理者
 *   await prisma.user.update({ where: { id }, data })
 *   return createSuccess('更新しました')
 * })
 */
export function withAuth<TArgs extends unknown[], TData = void>(
  fn: (user: User, ...args: TArgs) => Promise<ActionResult<TData>>
): (...args: TArgs) => Promise<ActionResult<TData>> {
  return async (...args: TArgs): Promise<ActionResult<TData>> => {
    const session = await getSession()
    const user = getSessionUser(session)

    if (!user) {
      return createFailure('ログインが必要です')
    }

    // 管理画面アクセス可能なロールをチェック
    if (!canAccessAdmin(user.role)) {
      return createFailure('管理者権限が必要です')
    }

    return await fn(user, ...args)
  }
}

// =============================================================================
// withPermission Higher Order Function
// =============================================================================

/**
 * 権限ベースの認可が必要なServer Actionをラップする高階関数
 *
 * - 認証 + 権限チェックを自動実行
 * - 監査ログを自動記録（書き込み操作時）
 * - EDITOR用のリソースIDチェックをサポート
 *
 * @param resource リソース種別
 * @param action アクション種別
 * @param options オプション
 *
 * @example
 * // 基本的な使用例
 * export const deleteSpace = withPermission('space', 'delete')(
 *   async (user, id: string) => {
 *     await prisma.space.delete({ where: { id } })
 *     return createSuccess('削除しました')
 *   }
 * )
 *
 * @example
 * // EDITOR用リソースIDチェック付き
 * export const updateBlog = withPermission('blog', 'update', { checkResourceAccess: true })(
 *   async (user, id: string, data: BlogInput) => {
 *     await prisma.blogPost.update({ where: { id }, data })
 *     return createSuccess('更新しました')
 *   }
 * )
 */
export function withPermission<TArgs extends unknown[], TData = void>(
  resource: Resource,
  action: Action,
  options: {
    /** EDITORの場合、第一引数をリソースIDとしてアクセス権をチェック */
    checkResourceAccess?: boolean
    /** 監査ログを記録するか（デフォルト: 書き込み操作のみ） */
    audit?: boolean
    /** 監査ログのアクション種別（デフォルト: actionから推論） */
    auditAction?: AuditAction
  } = {}
) {
  const {
    checkResourceAccess = false,
    audit = ['create', 'update', 'delete', 'publish'].includes(action),
    auditAction = actionToAuditAction(action),
  } = options

  return (
    fn: (user: User, ...args: TArgs) => Promise<ActionResult<TData>>
  ): ((...args: TArgs) => Promise<ActionResult<TData>>) => {
    return async (...args: TArgs): Promise<ActionResult<TData>> => {
      const session = await getSession()
      const user = getSessionUser(session)

      // 認証チェック
      if (!user) {
        return createFailure('ログインが必要です')
      }

      const role = user.role

      // 管理画面アクセス権チェック
      if (!canAccessAdmin(role)) {
        return createFailure('管理者権限が必要です')
      }

      // 権限チェック
      if (!hasPermission(role, resource, action)) {
        // 権限不足を監査ログに記録
        void logPermissionDenied(user.id, resource, action)
        return createFailure(`${resource}の${action}権限がありません`)
      }

      // EDITOR用リソースIDチェック
      if (checkResourceAccess && role === Role.EDITOR) {
        const resourceId = typeof args[0] === 'string' ? args[0] : undefined
        if (!userHasResourceAccess(user as User & { assignedPages?: string[] }, resource, action, resourceId)) {
          void logPermissionDenied(user.id, resource, action, resourceId)
          return createFailure('このリソースへのアクセス権がありません')
        }
      }

      // 関数実行
      const result = await fn(user, ...args)

      // 監査ログ記録（成功時のみ）
      if (audit && result.success) {
        const resourceId = typeof args[0] === 'string' ? args[0] : undefined
        void logUserAction({ id: user.id }, auditAction, resource, resourceId)
      }

      return result
    }
  }
}

// =============================================================================
// withReadPermission Higher Order Function
// =============================================================================

/**
 * 読み取り専用アクション用の軽量HOF
 *
 * - 認証 + 読み取り権限チェックのみ
 * - 監査ログなし（パフォーマンス優先）
 * - ActionResult<T>を返さない関数にも対応
 *
 * @param resource リソース種別
 *
 * @example
 * export const getSpaces = withReadPermission<
 *   [filters?: SpaceFilters, pagination?: SpacePagination],
 *   GetSpacesResult
 * >('space')(async (user, filters = {}, pagination = {}) => {
 *   const spaces = await prisma.space.findMany({ ... })
 *   return { spaces, total, page, limit, totalPages }
 * })
 */
export function withReadPermission<TArgs extends unknown[], TReturn>(
  resource: Resource
) {
  return (
    fn: (user: User, ...args: TArgs) => Promise<TReturn>
  ): ((...args: TArgs) => Promise<TReturn | ActionFailure>) => {
    return async (...args: TArgs): Promise<TReturn | ActionFailure> => {
      const session = await getSession()
      const user = getSessionUser(session)

      // 認証チェック
      if (!user) {
        return createFailure('ログインが必要です')
      }

      const role = user.role

      // 管理画面アクセス権チェック
      if (!canAccessAdmin(role)) {
        return createFailure('管理者権限が必要です')
      }

      // 読み取り権限チェック
      if (!hasPermission(role, resource, 'read')) {
        void logPermissionDenied(user.id, resource, 'read')
        return createFailure(`${resource}の閲覧権限がありません`)
      }

      return await fn(user, ...args)
    }
  }
}

// =============================================================================
// withRole Higher Order Function
// =============================================================================

/**
 * 特定ロール以上が必要なServer Actionをラップする高階関数
 *
 * @param requiredRole 必要な最低ロール
 *
 * @example
 * // SUPER_ADMIN専用
 * export const deleteUser = withRole(Role.SUPER_ADMIN)(
 *   async (user, id: string) => {
 *     await prisma.user.delete({ where: { id } })
 *     return createSuccess('削除しました')
 *   }
 * )
 */
export function withRole<TArgs extends unknown[], TData = void>(
  requiredRole: Role
) {
  return (
    fn: (user: User, ...args: TArgs) => Promise<ActionResult<TData>>
  ): ((...args: TArgs) => Promise<ActionResult<TData>>) => {
    return async (...args: TArgs): Promise<ActionResult<TData>> => {
      const session = await getSession()
      const user = getSessionUser(session)

      if (!user) {
        return createFailure('ログインが必要です')
      }

      const role = user.role

      // ロール階層チェック
      const roleHierarchy: readonly Role[] = [Role.SUPER_ADMIN, Role.ADMIN, Role.EDITOR, Role.VIEWER, Role.USER]
      const userRoleIndex = roleHierarchy.indexOf(role)
      const requiredRoleIndex = roleHierarchy.indexOf(requiredRole)

      if (userRoleIndex > requiredRoleIndex) {
        void logPermissionDenied(user.id, 'role', requiredRole)
        return createFailure(`${requiredRole}以上の権限が必要です`)
      }

      return await fn(user, ...args)
    }
  }
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * アクション種別を監査ログアクションに変換
 */
function actionToAuditAction(action: Action): AuditAction {
  switch (action) {
    case 'create':
      return AuditAction.CREATE
    case 'update':
      return AuditAction.UPDATE
    case 'delete':
      return AuditAction.DELETE
    case 'publish':
      return AuditAction.PUBLISH
    default:
      return AuditAction.UPDATE
  }
}
