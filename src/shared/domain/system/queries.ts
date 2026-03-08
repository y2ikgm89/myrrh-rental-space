import "server-only";

import { prisma } from "@/shared/db/prisma";

export async function runDatabaseHealthCheck(): Promise<void> {
  await prisma.$queryRaw`SELECT 1`;
}
