/**
 * Prisma Client Singleton（Prisma 7.8 / adapter-pg / Next.js 16 公式推奨パターン）
 *
 * - `globalThis` を使った singleton（hot reload 時のコネクションリーク防止）
 * - `PrismaPg` には接続設定オブジェクトを渡す（Prisma 7 公式推奨形式）。`pg.Pool` の
 *   生成・ライフサイクルは adapter-pg 内部に委譲し、アプリは外部 `pg` 依存を持たない
 * - v6 互換のタイムアウト設定を採用（v7 デフォルトの 10s idle は短すぎて Vercel/Cloud Run で早期切断される）
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 * @see https://www.prisma.io/docs/ai/prompts/nextjs
 */

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/shared/lib/env/server";
import { PrismaClient } from "@generated/prisma/client";
import type * as PrismaModels from "@generated/prisma/client";

export type AppPrismaClient = PrismaClient;

export type Space = PrismaModels.Space;
export type Reservation = PrismaModels.Reservation;
export type Customer = PrismaModels.Customer;
export type Coupon = PrismaModels.Coupon;
export type SpaceRatePlan = PrismaModels.SpaceRatePlan;
export type Receipt = PrismaModels.Receipt;

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
 * Prisma 公式 docs では、driver adapter 利用時の pool は underlying driver が
 * 管理し、Prisma Client が最初に接続を開くタイミングで作られる。ここでは
 * PrismaClient 自体を下記 globalStore singleton に寄せ、dev HMR で adapter /
 * client が増殖し続ける経路を閉じる。
 *
 * タイムアウト値は Prisma 公式の「v6 互換」推奨値に準拠:
 * - `connectionTimeoutMillis: 5_000` (v6 connect_timeout)
 * - `idleTimeoutMillis: 300_000` (v6 max_idle_connection_lifetime)
 * v7 デフォルト（idle 10s）は短すぎて Cloud Run のコールドスタート直後に切断される。
 * 値は validated server env で上書きできるが、未指定時はこの互換値を使う。
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
  connectionTimeoutMillis: serverEnv.DATABASE_CONNECTION_TIMEOUT_MS ?? 5_000,
  idleTimeoutMillis: serverEnv.DATABASE_IDLE_TIMEOUT_MS ?? 300_000,
  max: serverEnv.DATABASE_POOL_MAX ?? 10,
  statement_timeout: serverEnv.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000,
  idle_in_transaction_session_timeout:
    serverEnv.DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS ?? 15_000,
});

/**
 * アプリ標準の PrismaClient singleton
 *
 * 本番ではクエリログを有効化しない（パフォーマンス・ログサイズ両方のコスト）。
 * 開発環境でも `query` ログはノイズが大きいため `warn` + `error` に限定する。
 */
export const prisma =
  globalStore.prisma ??
  new PrismaClient({
    adapter,
    log: isProduction ? ["error"] : ["warn", "error"],
  });

if (!isProduction) {
  globalStore.prisma = prisma;
}
