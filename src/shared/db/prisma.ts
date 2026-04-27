/**
 * Prisma Client Singleton（Prisma 7.8 / adapter-pg / Next.js 16 公式推奨パターン）
 *
 * - `globalThis` を使った singleton（hot reload 時のコネクションリーク防止）
 * - `adapter-pg` には外部 `Pool` を渡して `externalPool` 経路に入れる（毎接続での新 Pool 生成を防止）
 * - v6 互換のタイムアウト設定を採用（v7 デフォルトの 10s idle は短すぎて Vercel/Cloud Run で早期切断される）
 * - Better Auth には素の `PrismaClient` を渡す（Decimal 拡張干渉を防ぐため）
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 * @see https://www.prisma.io/docs/ai/prompts/nextjs
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
 * Decimal → number 変換ユーティリティ型（`createAppPrismaClient` の runtime 挙動に整合）
 */
type ConvertDecimalFields<T> = {
  [K in keyof T]: T[K] extends Decimal
    ? number
    : T[K] extends Decimal | null
      ? number | null
      : T[K];
};

/** Decimal → number 変換済みの型エイリアス */
export type Space = ConvertDecimalFields<PrismaSpace>;
export type Reservation = ConvertDecimalFields<PrismaReservation>;
export type Customer = ConvertDecimalFields<PrismaCustomer>;
export type Settings = ConvertDecimalFields<PrismaSettings>;
export type Coupon = ConvertDecimalFields<PrismaCoupon>;

// ---------------------------------------------------------------------------
// Singleton: pg Pool + PrismaClient
// ---------------------------------------------------------------------------

type GlobalStore = {
  pgPool?: Pool;
  prisma?: PrismaClient;
};

const globalStore = globalThis as unknown as GlobalStore;
const isProduction = serverEnv.NODE_ENV === "production";

/**
 * pg Pool singleton
 *
 * `PrismaPg({ connectionString })` 形式だと `connect()` 毎に新 Pool が作られる
 * （adapter-pg 7.7 の実装詳細）。明示的な `Pool` インスタンスを渡すことで
 * externalPool 経路に入り、1 Pool が再利用される。
 *
 * タイムアウト値は Prisma 公式の「v6 互換」推奨値に準拠:
 * - `connectionTimeoutMillis: 5_000` (v6 connect_timeout)
 * - `idleTimeoutMillis: 300_000` (v6 max_idle_connection_lifetime)
 * v7 デフォルト（idle 10s）は短すぎて Cloud Run のコールドスタート直後に切断される。
 */
const pgPool =
  globalStore.pgPool ??
  new Pool({
    connectionString: serverEnv.DATABASE_URL,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
    max: serverEnv.DATABASE_POOL_MAX ?? 10,
  });

if (!isProduction) {
  globalStore.pgPool = pgPool;
}

const adapter = new PrismaPg(pgPool);

/**
 * Base PrismaClient（$extends 前の素のクライアント）
 *
 * 本番ではクエリログを有効化しない（パフォーマンス・ログサイズ両方のコスト）。
 * 開発環境でも `query` ログはノイズが大きいため `warn` + `error` に限定する。
 */
const basePrisma =
  globalStore.prisma ??
  new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["warn", "error"],
  });

if (!isProduction) {
  globalStore.prisma = basePrisma;
}

/**
 * 拡張前の素の PrismaClient（Better Auth アダプター専用）
 *
 * $extends 済み `prisma` は Decimal 変換が認証アダプターと干渉するため使わない。
 */
export { basePrisma };

/**
 * アプリ標準の PrismaClient（Decimal → number 変換済み）
 *
 * `createAppPrismaClient` で `$extends` を適用（seed と共通実装）。
 */
export const prisma = createAppPrismaClient(basePrisma);
