import "server-only";

import { prisma } from "@/shared/db/prisma";

export type ActiveAdminLoginToken = {
  id: string;
  createdAt: Date;
  expiresAt: Date;
  usedAt: Date | null;
};

export async function getActiveAdminLoginTokens(
  limit: number = 50,
): Promise<ActiveAdminLoginToken[]> {
  return prisma.loginToken.findMany({
    where: {
      expiresAt: {
        gt: new Date(),
      },
    },
    select: {
      id: true,
      createdAt: true,
      expiresAt: true,
      usedAt: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: limit,
  });
}
