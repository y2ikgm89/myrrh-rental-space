import "server-only";

import type { AdminAuthUser } from "@/shared/domain/admin-auth/queries";
import { getAssignedPageIdsForUser } from "@/shared/domain/user-page-assignments/queries";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Resource, Action } from "@/shared/lib/admin-resources";
import { isEditorRole } from "@/shared/lib/admin-role-guards";

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
 *
 * admin dashboard の mutation 経路（`executeAdminMutationResult`）と、
 * `src/app/(public)/preview/*` の閲覧専用プレビュールートの双方から参照される
 * （`(public)` tree は `@/admin/*` を import しない）。
 *
 * 呼び出し側で `isEditorRole` や `resourceId` の有無による事前分岐を置かないこと。
 * それらはすべて本関数が内包しており、前段分岐は変異検査で検出不能な
 * 振る舞い中立の死に分岐を生むだけである。
 */
export async function userHasResourceAccess(
  user: AdminAuthUser,
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<boolean> {
  if (!hasPermission(user.role, resource, action)) {
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
