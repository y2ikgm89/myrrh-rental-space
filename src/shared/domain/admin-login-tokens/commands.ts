import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function createAdminLoginTokenRecord(input: {
  token: string;
  createdBy: string;
  expiresAt: Date;
}): Promise<{ token: string; expiresAt: Date }> {
  const record = await prisma.loginToken.create({
    data: {
      token: input.token,
      createdBy: input.createdBy,
      expiresAt: input.expiresAt,
    },
    select: {
      token: true,
      expiresAt: true,
    },
  });

  return record;
}

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
