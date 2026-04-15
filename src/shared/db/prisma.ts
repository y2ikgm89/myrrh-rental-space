/**
 * Prisma Client Singleton
 *
 * Prisma 7 では接続リークを防ぐため、シングルトンパターンで実装します。
 * 開発環境では Hot Reload 時に新しいインスタンスが作成されないようにします。
 */

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
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

// pg Pool singleton
//
// PrismaPg のコンストラクタに config object を渡すと、`connect()` が呼ばれる
// たびに新しい Pool インスタンスを生成する（adapter-pg 7.7.0 の実装詳細）。
// 既存の Pool インスタンスを渡すことで externalPool 経路に入り、1 つの
// Pool が再利用される。max は Suspense ファンアウトと $transaction バッチを
// 余裕で捌けるサイズにしておく（デフォルト 10）。
const globalForPg = globalThis as unknown as { pgPool?: Pool };

const pgPool =
  globalForPg.pgPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
    connectionTimeoutMillis: 10000,
    idleTimeoutMillis: 10000,
    max: serverEnv.DATABASE_POOL_MAX ?? 10,
  });

if (serverEnv.NODE_ENV !== "production") {
  globalForPg.pgPool = pgPool;
}

const adapter = new PrismaPg(pgPool);

// 開発環境 hot reload 用のシングルトン保持。型宣言は実体所有者であるこの
// ファイル内で完結させる（global.d.ts に PrismaClient を import すると
// gateway 経由で client bundle に node 依存が漏れるリスクを生む）。
declare global {
  var prisma: PrismaClient | undefined;
}

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
 * 拡張前の素の PrismaClient
 *
 * Better Auth アダプター専用。$extends 済みの `prisma` を認証アダプターに
 * 渡すと Decimal 変換や joins が干渉するため、素のクライアントを使う。
 */
export { basePrisma };

/**
 * Prisma Client with Decimal to Number conversion
 *
 * `createAppPrismaClient` で拡張（`prisma/seed.ts` と同一設定）
 */
const prisma = createAppPrismaClient(basePrisma);

export { prisma };
