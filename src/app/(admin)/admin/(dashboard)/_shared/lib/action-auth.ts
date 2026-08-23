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
  type AdminAuthUser,
} from "@/shared/domain/admin-auth/session";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { canAccessAdmin } from "@/admin/lib/permissions";
import { userHasResourceAccess } from "@/shared/domain/admin-auth/resource-access";
import { authorizeAdmin } from "@/admin/lib/authorize";
import type { Action, Resource } from "@/shared/lib/admin-resources";
import { logUserAction, recordPermissionDenied } from "@/admin/lib/audit";
import type { MutationError } from "@/shared/lib/mutation-result";

// =============================================================================
// Types
// =============================================================================

export type AuthResult =
  | { success: true; user: AdminAuthUser }
  | { success: false; error: MutationError };

export type PermissionResult =
  | { success: true; user: AdminAuthUser }
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

  if (!authorizeAdmin(user, resource, action)) {
    return {
      success: false,
      error: { error: `${resource}の${action}権限がありません` },
    };
  }

  return { success: true, user };
}

/**
 * 認証済み user に対する認可だけを行う（RBAC + EDITOR の resource assignment）。
 *
 * `checkResourceAccess` との違いは **認証を含まない**こと。
 * resource / resourceId を DB から解決しないと認可対象が決まらない場合に、
 * `admin-action.ts` の「1. 認証 → 2. 解決 → 3. 認可」順序を守ったまま
 * 途中から再開するための入口（監査 A-57）。
 *
 * ここを使わずに `checkResourceAccess` を先に呼ぶと、**未認証の相手のために
 * DB lookup を実行する**形になる。
 */
export async function authorizeResourceAccess(
  user: AdminAuthUser,
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<PermissionResult> {
  if (!authorizeAdmin(user, resource, action, resourceId)) {
    return {
      success: false,
      error: { error: `${resource}の${action}権限がありません` },
    };
  }

  if (!(await userHasResourceAccess(user, resource, action, resourceId))) {
    recordPermissionDenied(user.id, resource, action, resourceId);
    return {
      success: false,
      error: { error: "このリソースへのアクセス権がありません" },
    };
  }

  return { success: true, user };
}

/**
 * リソースアクセスチェック（EDITOR用）。認証 → 認可をまとめて行う。
 *
 * resource / resourceId が呼出前に確定している場合専用。確定していないなら
 * `checkAdminAuth()` → 解決 → `authorizeResourceAccess()` の順で書く。
 */
export async function checkResourceAccess(
  resource: Resource,
  action: Action,
  resourceId?: string,
  requestHeaders?: Headers,
): Promise<PermissionResult> {
  const auth = await checkAdminAuth(requestHeaders);
  if (!auth.success) return auth;

  return authorizeResourceAccess(auth.user, resource, action, resourceId);
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
): Promise<void> {
  const auditAction = actionToAuditAction(action);
  return logUserAction({ id: userId }, auditAction, resource, resourceId);
}

function actionToAuditAction(action: Action): AuditAction {
  switch (action) {
    case "create":
      return AuditAction.CREATE;
    case "read":
      return AuditAction.READ;
    case "update":
      return AuditAction.UPDATE;
    case "delete":
      return AuditAction.DELETE;
    case "publish":
      return AuditAction.PUBLISH;
    case "manage":
      return AuditAction.MANAGE;
    default: {
      const _exhaustive: never = action;
      throw new Error(`Unhandled action: ${String(_exhaustive)}`);
    }
  }
}
