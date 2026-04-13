/**
 * Better Auth Prisma Adapter
 *
 * 公式推奨: prismaAdapter には拡張前の素の PrismaClient を渡す。
 * $extends 済みクライアント（Decimal→number 等）は認証アダプターと干渉するため使わない。
 *
 * @see https://www.better-auth.com/docs/adapters/prisma
 */

import "server-only";

import { prismaAdapter } from "better-auth/adapters/prisma";
import { basePrisma } from "./prisma";

export function createBetterAuthDatabaseAdapter() {
  // 公式推奨: $extends 前の素の PrismaClient を渡す（prisma ではなく basePrisma）
  return prismaAdapter(basePrisma, {
    provider: "postgresql",
  });
}
