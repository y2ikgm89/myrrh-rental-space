/**
 * 権限管理ライブラリ（server-only 統合層）
 *
 * 純粋 RBAC ロジック（`ROLE_PERMISSIONS` / `hasPermission` / `PermissionKey`
 * / `Resource` / `Action` / `RESOURCE_LABELS`、および role 型ガード
 * `isEditorRole` / `isAdminRole` / `isSuperAdminRole`）は client-safe SSoT である
 * `@/shared/lib/admin-permissions` / `@/shared/lib/admin-resources` /
 * `@/shared/lib/admin-role-guards` に集約。resource-level access チェック
 * （`userHasResourceAccess`）も `@/app/(public)/preview/*` から参照するため
 * `@/shared/domain/admin-auth/resource-access` に集約。
 *
 * 本ファイルは server-only セッション連携が必要なヘルパー
 * （`userHasPermission` / `canAccessAdmin`）と、UI 表示用ラベル
 * （`ACTION_LABELS`）のみを提供する。
 */

import "server-only";

import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { type AdminAuthUser } from "@/shared/domain/admin-auth/session";
import { isDashboardRole } from "@/shared/lib/admin-roles";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Resource, Action } from "@/shared/lib/admin-resources";

/**
 * アクション説明（UI 表示用）
 */
export const ACTION_LABELS: Record<Action, string> = {
  create: "作成",
  read: "閲覧",
  update: "編集",
  delete: "削除",
  publish: "公開",
  manage: "管理",
};

// =============================================================================
// server-only ヘルパー
// =============================================================================

/**
 * ユーザーが権限を持つかチェック（同期）
 */
export function userHasPermission(
  user: AdminAuthUser,
  resource: Resource,
  action: Action,
): boolean {
  return hasPermission(user.role, resource, action);
}

/**
 * 管理画面アクセス可能かチェック
 */
export function canAccessAdmin(role: Role): boolean {
  return isDashboardRole(role);
}
