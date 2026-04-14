/**
 * Server Action 認証ヘルパー
 *
 * HOFパターンを廃止し、各Server Action内で直接呼び出す関数を提供
 * Turbopack HMRの互換性のため、シンプルな構造を維持
 *
 * @module admin/lib/action-auth
 */

import "server-only";

import {
  getAdminSession,
  getAdminSessionUser,
  type AdminUser,
} from "@/shared/lib/admin-auth";
import { Role, AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import {
  hasPermission,
  userHasResourceAccess,
  canAccessAdmin,
  isEditorRole,
  type Resource,
  type Action,
} from "@/admin/lib/permissions";
import { logUserAction, logPermissionDenied } from "@/admin/lib/audit";
import type { MutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

export type AuthResult =
  | { success: true; user: AdminUser }
  | { success: false; error: MutationError };

export type PermissionResult =
  | { success: true; user: AdminUser }
  | { success: false; error: MutationError };

// =============================================================================
// Auth Functions (call inside server actions)
// =============================================================================

/**
 * 管理者認証チェック
 *
 * @example
 * ```ts
 * export async function myAction() {
 *   const auth = await checkAdminAuth()
 *   if (!auth.success) return auth.error
 *   const user = auth.user
 *   // ... action logic
 * }
 * ```
 */
export async function checkAdminAuth(
  requestHeaders?: Headers,
): Promise<AuthResult> {
  const session = await getAdminSession(requestHeaders);
  const user = getAdminSessionUser(session);

  if (!user) {
    return { success: false, error: { error: "ログインが必要です" } };
  }

  if (!canAccessAdmin(user.role)) {
    return { success: false, error: { error: "管理者権限が必要です" } };
  }

  return { success: true, user };
}

/**
 * 権限チェック
 *
 * @example
 * ```ts
 * export async function createSpace(data: SpaceInput) {
 *   const auth = await checkPermission('space', 'create')
 *   if (!auth.success) return auth.error
 *   const user = auth.user
 *   // ... action logic
 * }
 * ```
 */
export async function checkPermission(
  resource: Resource,
  action: Action,
  requestHeaders?: Headers,
): Promise<PermissionResult> {
  const auth = await checkAdminAuth(requestHeaders);
  if (!auth.success) return auth;

  const { user } = auth;

  if (!hasPermission(user.role, resource, action)) {
    void logPermissionDenied(user.id, resource, action);
    return {
      success: false,
      error: { error: `${resource}の${action}権限がありません` },
    };
  }

  return { success: true, user };
}

/**
 * リソースアクセスチェック（EDITOR用）
 */
export async function checkResourceAccess(
  resource: Resource,
  action: Action,
  resourceId?: string,
  requestHeaders?: Headers,
): Promise<PermissionResult> {
  const permResult = await checkPermission(resource, action, requestHeaders);
  if (!permResult.success) return permResult;

  const { user } = permResult;

  if (isEditorRole(user.role)) {
    if (!(await userHasResourceAccess(user, resource, action, resourceId))) {
      void logPermissionDenied(user.id, resource, action, resourceId);
      return {
        success: false,
        error: { error: "このリソースへのアクセス権がありません" },
      };
    }
  }

  return { success: true, user };
}

/**
 * ロールチェック
 */
export async function checkRole(
  requiredRole: Role,
  requestHeaders?: Headers,
): Promise<AuthResult> {
  const auth = await checkAdminAuth(requestHeaders);
  if (!auth.success) return auth;

  const { user } = auth;
  const roleHierarchy: readonly Role[] = [
    Role.SUPER_ADMIN,
    Role.ADMIN,
    Role.EDITOR,
    Role.VIEWER,
    Role.USER,
    Role.CUSTOMER,
  ];
  const userRoleIndex = roleHierarchy.indexOf(user.role);
  const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

  if (userRoleIndex > requiredRoleIndex) {
    void logPermissionDenied(user.id, "role", requiredRole);
    return {
      success: false,
      error: { error: `${requiredRole}以上の権限が必要です` },
    };
  }

  return { success: true, user };
}

// =============================================================================
// Audit Helper
// =============================================================================

/**
 * アクション実行後の監査ログ記録
 */
export function logAction(
  userId: string,
  action: Action,
  resource: Resource,
  resourceId?: string,
): void {
  const auditAction = actionToAuditAction(action);
  void logUserAction({ id: userId }, auditAction, resource, resourceId);
}

function actionToAuditAction(action: Action): AuditAction {
  switch (action) {
    case "create":
      return AuditAction.CREATE;
    case "update":
      return AuditAction.UPDATE;
    case "delete":
      return AuditAction.DELETE;
    case "publish":
      return AuditAction.PUBLISH;
    default:
      return AuditAction.UPDATE;
  }
}
