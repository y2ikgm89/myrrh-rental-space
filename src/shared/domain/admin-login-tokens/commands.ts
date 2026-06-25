import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function consumeAdminLoginToken(
  token: string,
  usedAt: Date = new Date(),
): Promise<boolean> {
  const result = await prisma.loginToken.updateMany({
    where: {
      token,
      usedAt: null,
      expiresAt: {
        gt: usedAt,
      },
    },
    data: {
      usedAt,
    },
  });

  return result.count === 1;
}
