import "server-only";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export function createBetterAuthDatabaseAdapter() {
  return prismaAdapter(prisma, {
    provider: "postgresql",
  });
}
