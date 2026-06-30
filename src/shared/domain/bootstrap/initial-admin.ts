import "server-only";

import { prisma } from "@/shared/db/prisma";
import { Role } from "@/shared/lib/validations/enums/prisma-types";

type InitialAdminInput = {
  email: string;
  name: string;
};

export async function ensureInitialSuperAdmin({
  email,
  name,
}: InitialAdminInput): Promise<void> {
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
