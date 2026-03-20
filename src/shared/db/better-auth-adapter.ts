import "server-only";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { prismaForBetterAuth } from "./prisma";

export function createBetterAuthDatabaseAdapter() {
  return prismaAdapter(prismaForBetterAuth, {
    provider: "postgresql",
  });
}
