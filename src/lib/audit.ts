/**
 * 監査ログライブラリ
 *
 * 書き込み操作とセキュリティイベントの記録
 * - 非同期記録（パフォーマンス優先）
 * - 失敗時は無視（ログ記録失敗でビジネスロジックを止めない）
 */

import { headers } from 'next/headers'
import { prisma } from './prisma'
import { AuditAction } from '@/generated/prisma/client/enums'

// =============================================================================
// Types
// =============================================================================

/**
 * 監査ログに必要な最小限のUser型
 *
 * - id のみを要求（フルUser型の受け渡しを防止）
 * - 型アサーション（as never）を排除するために導入
 */
export type AuditUser = {
  id: string
}

export type AuditLogInput = {
  userId?: string
  action: AuditAction
  resource: string
  resourceId?: string
  oldValue?: object
  newValue?: object
  metadata?: object
}

export type AuditLogMetadata = {
  ipAddress?: string
  userAgent?: string
  [key: string]: unknown
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * リクエストメタデータを取得
 */
async function getRequestMetadata(): Promise<AuditLogMetadata> {
  try {
    const headersList = await headers()
    return {
      ipAddress: headersList.get('x-forwarded-for') ?? headersList.get('x-real-ip') ?? undefined,
      userAgent: headersList.get('user-agent') ?? undefined,
    }
  } catch {
    return {}
  }
}

// =============================================================================
// Audit Log Functions
// =============================================================================

/**
 * 監査ログを記録（非同期、失敗無視）
 *
 * @param input ログ入力
 */
export async function createAuditLog(input: AuditLogInput): Promise<void> {
  try {
    const metadata = await getRequestMetadata()
    await prisma.auditLog.create({
      data: {
        userId: input.userId,
        action: input.action,
        resource: input.resource,
        resourceId: input.resourceId,
        oldValue: input.oldValue ?? undefined,
        newValue: input.newValue ?? undefined,
        metadata: { ...metadata, ...input.metadata } as object,
      },
    })
  } catch (error) {
    // ログ記録失敗は無視（本番ではSentry等に送信推奨）
    console.error('[AuditLog] Failed to create audit log:', error)
  }
}

/**
 * ユーザーコンテキスト付き監査ログ記録
 *
 * @param user 実行ユーザー（AuditUser: { id: string }）
 * @param action アクション
 * @param resource リソース種別
 * @param resourceId リソースID
 * @param oldValue 変更前の値
 * @param newValue 変更後の値
 */
export async function logUserAction(
  user: AuditUser,
  action: AuditAction,
  resource: string,
  resourceId?: string,
  oldValue?: object,
  newValue?: object
): Promise<void> {
  await createAuditLog({
    userId: user.id,
    action,
    resource,
    resourceId,
    oldValue,
    newValue,
  })
}

// =============================================================================
// セキュリティイベントログ
// =============================================================================

/**
 * ログイン成功を記録
 */
export async function logLoginSuccess(userId: string, email: string): Promise<void> {
  await createAuditLog({
    userId,
    action: AuditAction.LOGIN_SUCCESS,
    resource: 'auth',
    metadata: { email },
  })
}

/**
 * ログイン失敗を記録
 */
export async function logLoginFailed(email: string, reason?: string): Promise<void> {
  await createAuditLog({
    action: AuditAction.LOGIN_FAILED,
    resource: 'auth',
    metadata: { email, reason },
  })
}

/**
 * 権限不足を記録
 */
export async function logPermissionDenied(
  userId: string,
  resource: string,
  action: string,
  resourceId?: string
): Promise<void> {
  await createAuditLog({
    userId,
    action: AuditAction.PERMISSION_DENIED,
    resource,
    resourceId,
    metadata: { attemptedAction: action },
  })
}

/**
 * パスワード変更を記録
 */
export async function logPasswordChange(userId: string): Promise<void> {
  await createAuditLog({
    userId,
    action: AuditAction.PASSWORD_CHANGE,
    resource: 'auth',
  })
}

/**
 * ロール変更を記録
 */
export async function logRoleChange(
  userId: string,
  targetUserId: string,
  oldRole: string,
  newRole: string
): Promise<void> {
  await createAuditLog({
    userId,
    action: AuditAction.ROLE_CHANGE,
    resource: 'user',
    resourceId: targetUserId,
    oldValue: { role: oldRole },
    newValue: { role: newRole },
  })
}

// =============================================================================
// withAudit Higher Order Function
// =============================================================================

/**
 * Server Action に監査ログを自動付与する高階関数
 *
 * @param action 監査アクション
 * @param resource リソース種別
 * @param fn 実行する関数（第一引数にuser、第二引数以降はfn引数）
 * @returns 監査ログ付きの関数
 *
 * @example
 * export const deleteSpace = withAudit(AuditAction.DELETE, 'space')(
 *   async (user, id: string) => {
 *     await prisma.space.delete({ where: { id } })
 *     return createSuccess('削除しました')
 *   }
 * )
 */
export function withAudit<TArgs extends unknown[], TResult>(
  action: AuditAction,
  resource: string
) {
  return (fn: (user: AuditUser, ...args: TArgs) => Promise<TResult>) => {
    return async (user: AuditUser, ...args: TArgs): Promise<TResult> => {
      // リソースIDは第一引数がstring型の場合に使用
      const resourceId = typeof args[0] === 'string' ? args[0] : undefined

      // 関数実行
      const result = await fn(user, ...args)

      // 成功時のみログ記録（型安全なチェック）
      if (isSuccessResult(result)) {
        void logUserAction(user, action, resource, resourceId)
      }

      return result
    }
  }
}

/**
 * ActionResult互換の成功判定
 * - { success: true } を持つオブジェクトを成功とみなす
 */
function isSuccessResult(result: unknown): boolean {
  return (
    typeof result === 'object' &&
    result !== null &&
    'success' in result &&
    (result as { success: unknown }).success === true
  )
}
