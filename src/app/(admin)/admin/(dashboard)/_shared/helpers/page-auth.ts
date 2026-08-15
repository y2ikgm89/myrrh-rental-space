/**
 * Admin dashboard page auth facade — app-layer SSoT for page/layout gates.
 *
 * Query modules under `@/admin/queries/*` may still call `@/admin/queries/_helpers`
 * directly. New dashboard pages and layouts should import from here.
 *
 * ## Archetypes
 *
 * | Helper | Permission | Use when |
 * | --- | --- | --- |
 * | `requireAdminDashboardPage()` | session only | Layout chrome, list/detail headers needing role-based UI |
 * | `requireAuditLogListPage()` | `auditLog:read` | 監査ログ一覧 |
 * | `requireStaffListPage()` | `user:read` | スタッフ一覧 |
 * | `requireStaffDetailPage(userId)` | `user:read` + editor scope | スタッフ詳細 |
 * | `requireCouponCreatePage()` | `coupon:create` | クーポン新規作成フォーム |
 * | `requireSettingsPage()` | `settings:read` | 設定ハブと閲覧系サブページ |
 * | `requireSettingsManagePage()` | `settings:manage` | 高リスク設定ページ |
 *
 * Data loaders in `@/admin/queries/*` continue to enforce resource permissions at
 * fetch time; pair `requireAdminDashboardPage()` with those loaders on list/detail
 * pages that only need the user for conditional UI (export buttons, create links).
 */

import "server-only";

import {
  requireAdminDashboardAccess,
  requireAdminPermission,
  requireAdminResourcePermission,
} from "@/admin/queries/_helpers";
import type { AdminAuthUser } from "@/shared/domain/admin-auth/session";

/** Dashboard shell: IAP session + dashboard role only. */
export async function requireAdminDashboardPage(): Promise<AdminAuthUser> {
  return requireAdminDashboardAccess();
}

/**
 * 監査ログ一覧（`auditLog:read`）。
 *
 * resource を引数で受けない。ページ側にリテラルが残ると `("auditLog")` を
 * `("page")` に降格しても型検査を通り、検出には「ページ→権限」の対応表が要る
 * （第6次監査 M-18）。要求権限の記述はこのファイル 1 箇所だけが持ち、
 * `__tests__/unit/admin/helpers/page-auth.test.ts` が実 hasPermission で固定する。
 */
export async function requireAuditLogListPage(): Promise<AdminAuthUser> {
  return requireAdminPermission("auditLog", "read");
}

/** スタッフ一覧（`user:read`）。 */
export async function requireStaffListPage(): Promise<AdminAuthUser> {
  return requireAdminPermission("user", "read");
}

/**
 * スタッフ詳細（`user:read` + editor assignment scope）。
 *
 * scope 判定は EDITOR にしか効かず、EDITOR は `user:read` を持たないため現状は
 * 到達しない。`requireAdminPermission` に落とすと振る舞いは同じだが、
 * 権限表を変えたときの挙動が変わるのでそのまま resource 版を呼ぶ。
 */
export async function requireStaffDetailPage(
  userId: string,
): Promise<AdminAuthUser> {
  return requireAdminResourcePermission("user", "read", userId);
}

/** クーポン新規作成フォーム（`coupon:create`）。 */
export async function requireCouponCreatePage(): Promise<AdminAuthUser> {
  return requireAdminPermission("coupon", "create");
}

/** 設定ハブと閲覧系サブページ（`settings:read`）。 */
export async function requireSettingsPage(): Promise<AdminAuthUser> {
  return requireAdminPermission("settings", "read");
}

/**
 * 高リスク設定ページ（`settings:manage`）。
 *
 * これらのページが読むデータは全て `settings:read` で取れるため、`manage` 要求は
 * ページ側にしか存在しない（DAL に寄せられない。とくに system は `getSettings` しか
 * 読まない）。したがって「どのページが manage を要求するか」は
 * `__tests__/unit/architecture/admin-settings-permissions.test.ts` が別途固定する。
 */
export async function requireSettingsManagePage(): Promise<AdminAuthUser> {
  return requireAdminPermission("settings", "manage");
}
