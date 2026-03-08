import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Role } from "@/shared/db/prisma";

export async function upsertPermissionDefinition(input: {
  resource: string;
  action: string;
  description: string;
}): Promise<void> {
  await prisma.permission.upsert({
    where: {
      resource_action: {
        resource: input.resource,
        action: input.action,
      },
    },
    create: {
      resource: input.resource,
      action: input.action,
      description: input.description,
    },
    update: {},
  });
}

export async function assignPermissionToRole(
  role: Role,
  permissionId: string,
): Promise<void> {
  await prisma.rolePermission.upsert({
    where: {
      role_permissionId: {
        role,
        permissionId,
      },
    },
    create: {
      role,
      permissionId,
    },
    update: {},
  });
}
