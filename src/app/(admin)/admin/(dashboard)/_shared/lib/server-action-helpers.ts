/**
 * Server Actions Higher Order Functions
 *
 * 認証・認可・監査ログを自動化するHOF群
 * 全てのServer Actionsで使用する
 *
 * 注意: このファイルには 'use server' ディレクティブを付けない
 * HOFは Server Actions ではなく、Server Actions を作成するユーティリティ
 * 各 actions/*.ts ファイル（'use server' 付き）でインポートして使用する
 */

import "server-only";
import { getSession, getSessionUser, type User } from "@/shared/lib/auth";
import { Role, AuditAction } from "@/shared/db/enums";
import {
  hasPermission,
  userHasResourceAccess,
  canAccessAdmin,
  isEditorRole,
  type Resource,
  type Action,
} from "@/admin/lib/permissions";
import { logUserAction, logPermissionDenied } from "@/admin/lib/audit";
import {
  type ActionFailure,
  type ActionResult,
  createFailure,
} from "@/admin/types/server-actions";

// =============================================================================
// withPermission Higher Order Function
// =============================================================================

/**
 * 権限ベースの認可が必要なServer Actionをラップする高階関数
 *
 * @param resource リソース種別
 * @param action アクション種別
 * @param options オプション
 */
export function withPermission<TArgs extends unknown[], TData = void>(
  resource: Resource,
  action: Action,
  options: {
    checkResourceAccess?: boolean;
    audit?: boolean;
    auditAction?: AuditAction;
  } = {},
) {
  const {
    checkResourceAccess = false,
    audit = ["create", "update", "delete", "publish"].includes(action),
    auditAction = actionToAuditAction(action),
  } = options;

  return (
    fn: (user: User, ...args: TArgs) => Promise<ActionResult<TData>>,
  ): ((...args: TArgs) => Promise<ActionResult<TData>>) => {
    return async (...args: TArgs): Promise<ActionResult<TData>> => {
      const session = await getSession();
      const user = getSessionUser(session);

      if (!user) {
        return createFailure("ログインが必要です");
      }

      const role = user.role;

      if (!canAccessAdmin(role)) {
        return createFailure("管理者権限が必要です");
      }

      if (!hasPermission(role, resource, action)) {
        void logPermissionDenied(user.id, resource, action);
        return createFailure(`${resource}の${action}権限がありません`);
      }

      if (checkResourceAccess && isEditorRole(role)) {
        const resourceId = typeof args[0] === "string" ? args[0] : undefined;
        if (
          !(await userHasResourceAccess(user, resource, action, resourceId))
        ) {
          void logPermissionDenied(user.id, resource, action, resourceId);
          return createFailure("このリソースへのアクセス権がありません");
        }
      }

      const result = await fn(user, ...args);

      if (audit && result.success) {
        const resourceId = typeof args[0] === "string" ? args[0] : undefined;
        void logUserAction({ id: user.id }, auditAction, resource, resourceId);
      }

      return result;
    };
  };
}

// =============================================================================
// withReadPermission Higher Order Function
// =============================================================================

/**
 * 読み取り専用アクション用の軽量HOF
 */
export function withReadPermission<TArgs extends unknown[], TReturn>(
  resource: Resource,
) {
  return (
    fn: (user: User, ...args: TArgs) => Promise<TReturn>,
  ): ((...args: TArgs) => Promise<TReturn | ActionFailure>) => {
    return async (...args: TArgs): Promise<TReturn | ActionFailure> => {
      const session = await getSession();
      const user = getSessionUser(session);

      if (!user) {
        return createFailure("ログインが必要です");
      }

      const role = user.role;

      if (!canAccessAdmin(role)) {
        return createFailure("管理者権限が必要です");
      }

      if (!hasPermission(role, resource, "read")) {
        void logPermissionDenied(user.id, resource, "read");
        return createFailure(`${resource}の閲覧権限がありません`);
      }

      return await fn(user, ...args);
    };
  };
}

// =============================================================================
// withRole Higher Order Function
// =============================================================================

/**
 * 特定ロール以上が必要なServer Actionをラップする高階関数
 */
export function withRole<TArgs extends unknown[], TData = void>(
  requiredRole: Role,
) {
  return (
    fn: (user: User, ...args: TArgs) => Promise<ActionResult<TData>>,
  ): ((...args: TArgs) => Promise<ActionResult<TData>>) => {
    return async (...args: TArgs): Promise<ActionResult<TData>> => {
      const session = await getSession();
      const user = getSessionUser(session);

      if (!user) {
        return createFailure("ログインが必要です");
      }

      const role = user.role;

      const roleHierarchy: readonly Role[] = [
        Role.SUPER_ADMIN,
        Role.ADMIN,
        Role.EDITOR,
        Role.VIEWER,
        Role.USER,
      ];
      const userRoleIndex = roleHierarchy.indexOf(role);
      const requiredRoleIndex = roleHierarchy.indexOf(requiredRole);

      if (userRoleIndex > requiredRoleIndex) {
        void logPermissionDenied(user.id, "role", requiredRole);
        return createFailure(`${requiredRole}以上の権限が必要です`);
      }

      return await fn(user, ...args);
    };
  };
}

// =============================================================================
// Helper Functions
// =============================================================================

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
