/**
 * 権限管理ライブラリ（server-only 統合層）
 *
 * 純粋 RBAC ロジック（`ROLE_PERMISSIONS` / `hasPermission` / `PermissionKey`
 * / `Resource` / `Action` / `RESOURCE_LABELS`）は client-safe SSoT である
 * `@/shared/lib/admin-permissions` / `@/shared/lib/admin-resources` に集約。
 *
 * 本ファイルは server-only セッション / Prisma 連携が必要なヘルパー
 * （`userHasPermission` / `userHasResourceAccess` / `canAccessAdmin`）
 * と、UI 表示用ラベル（`ACTION_LABELS`）を提供する。
 */

import "server-only";

import { Role } from "@/shared/lib/validations/enums/prisma-types";
import { type AdminUser } from "@/shared/lib/admin-auth";
import { isDashboardRole } from "@/shared/lib/admin-roles";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Resource, Action } from "@/shared/lib/admin-resources";
import { isEditorRole } from "./role-guards";

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
  user: AdminUser,
  resource: Resource,
  action: Action,
): boolean {
  return hasPermission(user.role, resource, action);
}

/**
 * ユーザーが特定リソースIDへのアクセス権を持つかチェック。
 *
 * EDITOR ロールは `page` resource 専用の resource-level access 制御を受ける:
 * - **resourceId は page UUID 必須** — `userPageAssignment` テーブルが page に
 *   のみ紐づく設計のため、`assignedPageIds.includes(resourceId)` は page UUID
 *   でしか成立しない。slug や section ID を渡すと常に拒否される silent bug。
 * - section 等の **page 子リソース**で `checkResourceAccess: true` を使う場合は、
 *   `executeAdminMutationResult` の `resolveResourceId` callback で子 ID から
 *   親 page UUID を解決してから渡す。
 *
 * EDITOR の権限自体（`ROLE_PERMISSIONS.EDITOR`）は page / media / blockTemplate(read)
 * / notification(read) に絞られているため、他 resource はそもそも `hasPermission`
 * で先に弾かれる。本関数の page-UUID 比較ロジックは `page` resource でのみ意味を持つ。
 */
export async function userHasResourceAccess(
  user: AdminUser,
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<boolean> {
  if (!userHasPermission(user, resource, action)) {
    return false;
  }

  if (!isEditorRole(user.role)) {
    return true;
  }

  if (!resourceId) {
    return true;
  }

  const assignedPageIds = await getAssignedPageIdsForUser(user.id);
  return assignedPageIds.includes(resourceId);
}

/**
 * 管理画面アクセス可能かチェック
 */
export function canAccessAdmin(role: Role): boolean {
  return isDashboardRole(role);
}

export { isEditorRole, isAdminRole, isSuperAdminRole } from "./role-guards";
