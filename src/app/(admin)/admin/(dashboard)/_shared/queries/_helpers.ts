import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logPermissionDenied } from "@/admin/lib/audit";
import { isEditorRole, userHasResourceAccess } from "@/admin/lib/permissions";
import { hasPermission } from "@/shared/lib/admin-permissions";
import type { Action, Resource } from "@/shared/lib/admin-resources";
import { verifyAdminSession, type AdminUser } from "@/shared/lib/admin-auth";

function redirectToAdminHome(): never {
  redirect("/admin");
}

export async function requireAdminDashboardAccess(): Promise<AdminUser> {
  await headers();
  return verifyAdminSession();
}

export async function requireAdminPermission(
  resource: Resource,
  action: Action,
): Promise<AdminUser> {
  await headers();
  const user = await verifyAdminSession();

  if (!hasPermission(user.role, resource, action)) {
    void logPermissionDenied(user.id, resource, action);
    redirectToAdminHome();
  }

  return user;
}

export async function requireAdminResourcePermission(
  resource: Resource,
  action: Action,
  resourceId?: string,
): Promise<AdminUser> {
  await headers();
  const user = await requireAdminPermission(resource, action);

  if (!resourceId || !isEditorRole(user.role)) {
    return user;
  }

  if (!(await userHasResourceAccess(user, resource, action, resourceId))) {
    void logPermissionDenied(user.id, resource, action, resourceId);
    redirectToAdminHome();
  }

  return user;
}
