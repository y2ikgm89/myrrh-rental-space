/**
 * Better Auth Prisma Adapter
 *
 * 公式推奨: prismaAdapter には PrismaClient を渡す。
 *
 * @see https://www.better-auth.com/docs/adapters/prisma
 */

import "server-only";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "./prisma";

export function createBetterAuthDatabaseAdapter() {
  return prismaAdapter(prisma, {
    provider: "postgresql",
  });
}
