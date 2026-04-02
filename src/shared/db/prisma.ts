/**
 * Prisma Client Singleton
 *
 * Prisma 7 では接続リークを防ぐため、シングルトンパターンで実装します。
 * 開発環境では Hot Reload 時に新しいインスタンスが作成されないようにします。
 */

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/shared/lib/env/server";
import {
  PrismaClient,
  type Space as PrismaSpace,
  type Reservation as PrismaReservation,
  type Customer as PrismaCustomer,
  type Settings as PrismaSettings,
  type Coupon as PrismaCoupon,
} from "@generated/prisma/client";
import type { Decimal } from "@prisma/client/runtime/client";

import { createAppPrismaClient } from "./create-app-prisma-client";

export type { AppPrismaClient } from "./create-app-prisma-client";

/**
 * Decimal → number 変換ユーティリティ型
 * Decimal型のみを変換し、他の型はそのまま保持する
 */
type ConvertDecimalFields<T> = {
  [K in keyof T]: T[K] extends Decimal
    ? number
    : T[K] extends Decimal | null
      ? number | null
      : T[K];
};

/**
 * Extended Prisma types with Decimal converted to number
 */
export type Space = ConvertDecimalFields<PrismaSpace>;
export type Reservation = ConvertDecimalFields<PrismaReservation>;
export type Customer = ConvertDecimalFields<PrismaCustomer>;
export type Settings = ConvertDecimalFields<PrismaSettings>;
export type Coupon = ConvertDecimalFields<PrismaCoupon>;

// Prisma アダプター（PrismaPg が Pool ライフサイクルを内部管理）
const adapter = new PrismaPg({
  connectionString: serverEnv.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  max:
    serverEnv.DATABASE_POOL_MAX ??
    (serverEnv.NODE_ENV === "production" ? 3 : 5),
});

// グローバル変数（型は src/shared/types/global.d.ts で定義）
const globalForPrisma = globalThis;

/**
 * Base Prisma Client インスタンス
 *
 * - 開発環境: グローバル変数に保存して再利用
 * - 本番環境: 新しいインスタンスを作成
 */
const basePrisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      serverEnv.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// 開発環境ではグローバル変数に保存
if (serverEnv.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
}

/**
 * Better Auth / Prisma アダプター専用のベースクライアント
 *
 * `$extends` により Decimal 変換などを加えた `prisma` はアプリ本体向け。
 * 認証アダプターは公式推奨どおり素のクライアントデリゲートに任せ、
 * `experimental.joins` 時のリレーション select とも干渉させない。
 */
export const prismaForBetterAuth = basePrisma;

/**
 * Prisma Client with Decimal to Number conversion
 *
 * `createAppPrismaClient` で拡張（`prisma/seed.ts` と同一設定）
 */
const prisma = createAppPrismaClient(basePrisma);

export { prisma };
