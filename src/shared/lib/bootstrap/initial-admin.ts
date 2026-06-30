import "server-only";

import { Role } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import { serverEnv } from "@/shared/lib/env/server";

export async function bootstrapInitialAdmin(): Promise<void> {
  const email = serverEnv.INITIAL_ADMIN_EMAIL;
  if (!email) return;

  const name = serverEnv.INITIAL_ADMIN_NAME ?? email;
  const superAdminCount = await prisma.user.count({
    where: { role: Role.SUPER_ADMIN },
  });
  if (superAdminCount > 0) return;

  const existing = await prisma.user.findUnique({
    where: { email },
    select: { id: true },
  });

  if (existing) {
    await prisma.user.update({
      where: { id: existing.id },
      data: { name, role: Role.SUPER_ADMIN, emailVerified: true },
    });
    return;
  }

  await prisma.user.create({
    data: {
      email,
      name,
      role: Role.SUPER_ADMIN,
      emailVerified: true,
    },
  });
}
