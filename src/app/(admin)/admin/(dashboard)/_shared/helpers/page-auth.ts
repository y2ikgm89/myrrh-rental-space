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
 * | `requireAdminListPage(resource)` | `{resource}:read` | Index pages that own the read gate (settings hub, resource lists) |
 * | `requireAdminDetailPage(resource, id?)` | `{resource}:read` + editor scope | Detail pages with per-resource editor assignments |
 * | `requireAdminSettingsPage(action?)` | `settings:read` or `settings:manage` | Settings hub and subpages |
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
import type { Action, Resource } from "@/shared/lib/admin-resources";

/** Dashboard shell: IAP session + dashboard role only. */
export async function requireAdminDashboardPage(): Promise<AdminAuthUser> {
  return requireAdminDashboardAccess();
}

/** List/index pages that enforce read access at the page boundary. */
export async function requireAdminListPage(
  resource: Resource,
): Promise<AdminAuthUser> {
  return requireAdminPermission(resource, "read");
}

/** Detail pages; optional `resourceId` applies editor assignment scope. */
export async function requireAdminDetailPage(
  resource: Resource,
  resourceId?: string,
): Promise<AdminAuthUser> {
  return requireAdminResourcePermission(resource, "read", resourceId);
}

/** Settings hub (`read`) and mutation subpages (`manage`). */
export async function requireAdminSettingsPage(
  action: Extract<Action, "read" | "manage"> = "read",
): Promise<AdminAuthUser> {
  return requireAdminPermission("settings", action);
}
