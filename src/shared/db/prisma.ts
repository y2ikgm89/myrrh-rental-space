/**
 * Prisma Client Singleton（Prisma 7.8 / adapter-pg / Next.js 16 公式推奨パターン）
 *
 * - `globalThis` を使った singleton（hot reload 時のコネクションリーク防止）
 * - `PrismaPg` には接続設定オブジェクトを渡す（Prisma 7 公式推奨形式）。`pg.Pool` の
 *   生成・ライフサイクルは adapter-pg 内部に委譲し、アプリは外部 `pg` 依存を持たない
 * - v6 互換のタイムアウト設定を採用（v7 デフォルトの 10s idle は短すぎて Vercel/Cloud Run で早期切断される）
 * - Better Auth には素の `PrismaClient` を渡す（Decimal 拡張干渉を防ぐため）
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 * @see https://www.prisma.io/docs/ai/prompts/nextjs
 */

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/shared/lib/env/server";
import { PrismaClient } from "@generated/prisma/client";
import type * as PrismaModels from "@generated/prisma/client";
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
export type Space = ConvertDecimalFields<PrismaModels.Space>;
export type Reservation = ConvertDecimalFields<PrismaModels.Reservation>;
export type Customer = ConvertDecimalFields<PrismaModels.Customer>;
export type Settings = ConvertDecimalFields<PrismaModels.Settings>;
export type Coupon = ConvertDecimalFields<PrismaModels.Coupon>;

// ---------------------------------------------------------------------------
// Singleton: PrismaClient
// ---------------------------------------------------------------------------

type GlobalStore = {
  prisma?: PrismaClient;
};

declare global {
  // ambient global singleton store (HMR / cold start でのリーク防止)
  var __myrrhPrismaGlobalStore: GlobalStore | undefined;
}

const globalStore: GlobalStore = (globalThis.__myrrhPrismaGlobalStore ??= {});
const isProduction = serverEnv.NODE_ENV === "production";

/**
 * Prisma driver adapter（adapter-pg）
 *
 * `PrismaPg` に接続設定オブジェクトを渡す Prisma 7 公式推奨形式。`pg.Pool` の
 * 生成は adapter-pg が `connect()` 時に内部で 1 度だけ行う。`connect()` は
 * PrismaClient のライフタイムにつき 1 回しか呼ばれず（client engine が
 * memoize する公式仕様）、PrismaClient 自体が下記 globalStore singleton の
 * ため、Pool も実質 1 インスタンスに収束する。
 *
 * タイムアウト値は Prisma 公式の「v6 互換」推奨値に準拠:
 * - `connectionTimeoutMillis: 5_000` (v6 connect_timeout)
 * - `idleTimeoutMillis: 300_000` (v6 max_idle_connection_lifetime)
 * v7 デフォルト（idle 10s）は短すぎて Cloud Run のコールドスタート直後に切断される。
 *
 * サーバー側クエリ／トランザクション上限（プール枯渇対策）:
 * - `statement_timeout` … 1 クエリの最大実行時間。これが無いと runaway / lock 待ちの
 *   1 クエリが接続を無制限に占有し、concurrency=80 / pool=10 の単一インスタンスで
 *   残り接続を巻き込み acquire timeout 由来の 500 を誘発する。
 * - `idle_in_transaction_session_timeout` … トランザクション内でアイドル放置された
 *   接続を打ち切り、ハングした BEGIN がプールを食い潰すのを防ぐ。
 * いずれも `pg.Pool` が全 client に転送する（node-postgres 公式）。値は正規の
 * 管理レポート／エクスポートより十分長い 15s に設定（runaway のみを打ち切る）。
 */
const adapter = new PrismaPg({
  connectionString: serverEnv.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 300_000,
  max: serverEnv.DATABASE_POOL_MAX ?? 10,
  statement_timeout: 15_000,
  idle_in_transaction_session_timeout: 15_000,
});

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
