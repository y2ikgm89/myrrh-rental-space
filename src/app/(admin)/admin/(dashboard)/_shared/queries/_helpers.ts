import "server-only";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { logPermissionDenied } from "@/admin/lib/audit";
import {
  hasPermission,
  isEditorRole,
  userHasResourceAccess,
  type Action,
  type Resource,
} from "@/admin/lib/permissions";
import { verifyAdminSession, type User } from "@/shared/lib/auth";

function redirectToAdminHome(): never {
  redirect("/admin");
}

export async function requireAdminDashboardAccess(): Promise<User> {
  await headers();
  return verifyAdminSession();
}

export async function requireAdminPermission(
  resource: Resource,
  action: Action,
): Promise<User> {
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
): Promise<User> {
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
