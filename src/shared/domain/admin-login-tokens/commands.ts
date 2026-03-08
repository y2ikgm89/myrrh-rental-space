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
