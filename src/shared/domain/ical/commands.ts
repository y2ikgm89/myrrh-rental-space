import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function markICalTokenUsed(id: string): Promise<void> {
  await prisma.iCalToken.update({
    where: { id },
    data: { lastUsedAt: new Date() },
  });
}
