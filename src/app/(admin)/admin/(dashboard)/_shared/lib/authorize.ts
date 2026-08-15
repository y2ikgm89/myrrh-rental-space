import "server-only";

import { recordPermissionDenied } from "@/admin/lib/audit";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { AdminAuthUser } from "@/shared/domain/admin-auth/session";
import type { Action, Resource } from "@/shared/lib/admin-resources";

/**
 * RBAC の判定と、拒否時の監査記録。**唯一の判定サイト。**
 *
 * 拒否の表現は層ごとに違う（Server Action は result union、page / query helper は
 * `notFound()`、mutation wrapper は `MutationResult`）。それは層の違いに由来する
 * 意図的な差なので統合しない。統合するのは判定だけ。
 *
 * 呼び出し側はこの関数が false を返したら、自分の層の形で拒否を返すこと。
 * `recordPermissionDenied` を重ねて呼ばない（監査ログが二重になる）。
 */
export function authorizeAdmin(
  user: AdminAuthUser,
  resource: Resource,
  action: Action,
  resourceId?: string,
): boolean {
  if (hasPermission(user.role, resource, action)) return true;

  recordPermissionDenied(user.id, resource, action, resourceId);
  return false;
}
