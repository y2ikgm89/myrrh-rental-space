import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Role } from "@/shared/db/prisma";

export async function getAssignedPageIdsForUser(userId: string): Promise<string[]> {
  const assignments = await prisma.userPageAssignment.findMany({
    where: { userId },
    select: { pageId: true },
  });

  return assignments.map((assignment) => assignment.pageId);
}

export async function checkRolePermissionRecord(
  role: Role,
  resource: string,
  action: string,
): Promise<boolean> {
  const permission = await prisma.permission.findUnique({
    where: { resource_action: { resource, action } },
    include: {
      rolePermissions: {
        where: { role },
      },
    },
  });

  return (permission?.rolePermissions.length ?? 0) > 0;
}

export async function getRolePermissionRecords(
  role: Role,
): Promise<Array<{ resource: string; action: string }>> {
  const rolePermissions = await prisma.rolePermission.findMany({
    where: { role },
    include: { permission: true },
  });

  return rolePermissions.map((rolePermission) => ({
    resource: rolePermission.permission.resource,
    action: rolePermission.permission.action,
  }));
}

export async function findPermissionId(
  resource: string,
  action: string,
): Promise<string | null> {
  const permission = await prisma.permission.findUnique({
    where: { resource_action: { resource, action } },
    select: { id: true },
  });

  return permission?.id ?? null;
}
