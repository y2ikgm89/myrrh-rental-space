/**
 * Prisma Client Singleton（Prisma 7.8 / adapter-pg / Next.js 16 公式推奨パターン）
 *
 * - `globalThis` を使った singleton（hot reload 時のコネクションリーク防止）
 * - `PrismaPg` には接続設定オブジェクトを渡す（Prisma 7 公式推奨形式）。`pg.Pool` の
 *   生成・ライフサイクルは adapter-pg 内部に委譲し、アプリは外部 `pg` 依存を持たない
 * - idle は v6 互換値（v7 デフォルトの 10s idle は短すぎて Vercel/Cloud Run で早期切断される）、
 *   connect は Neon の scale-to-zero 復帰を見た Neon 公式値（下の adapter の docblock）
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 * @see https://www.prisma.io/docs/ai/prompts/nextjs
 */

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/shared/lib/env/server";
import {
  ErrorCategory,
  ErrorSeverity,
  logError,
} from "@/shared/lib/errors/server";
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
 * プール／接続レベルのエラーを構造化ログに出す。
 *
 * adapter-pg は `pool.on("error")` と tx 用 connection の `on("error")` を**常に**
 * 自前で張るので、listener 不在で process が落ちる node-postgres の定番の穴は
 * 元から塞がっている。ただし callback を渡さないと、その listener の中身は
 * `Debug("prisma:driver-adapter:pg")` の 1 行だけになる。これは `DEBUG` 環境変数を
 * 立てないと何も出力しないため、**本番ではアイドル接続のエラーが完全に消える**。
 *
 * ここで拾うのは「クエリを実行していない接続」で起きた事象（Neon 側のアイドル切断・
 * ネットワーク断・サーバー再起動）で、失敗したクエリ自体は呼び出し元が別途 throw を
 * 受け取る。したがってこれ単体は利用者影響のある障害ではなく WARNING 相当にする
 * （ERROR にすると Error Reporting が平常運転で鳴り続ける）。
 */
function logPoolError(source: string, error: Error): void {
  logError(error, {
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    context: { operation: "prismaPool", source },
  });
}

/**
 * Prisma driver adapter（adapter-pg）
 *
 * `PrismaPg` に接続設定オブジェクトを渡す Prisma 7 公式推奨形式。`pg.Pool` の
 * Prisma 公式 docs では、driver adapter 利用時の pool は underlying driver が
 * 管理し、Prisma Client が最初に接続を開くタイミングで作られる。ここでは
 * PrismaClient 自体を下記 globalStore singleton に寄せ、dev HMR で adapter /
 * client が増殖し続ける経路を閉じる。
 *
 * `connectionTimeoutMillis` の出どころは **Neon（デプロイ先）であって Prisma ではない**。
 * 元は Prisma の「v6 互換」既定 5_000 だったが、これは Prisma のバージョン間互換の
 * 都合で決まった値で、**接続先が suspend から復帰する時間を一度も見ていない**。
 * Neon Free は 5 分アイドルで compute を止めるので、`idleTimeoutMillis` 300_000 で
 * プールの遊休接続が落ちた直後の 1 本目は構造的に cold start を踏む。
 *
 * 実測（本番 2026-08-29T07:00Z、Cloud Scheduler の 14 リクエストが同一インスタンス =
 * 同一プールに着弾したバースト）: 成功した新規接続 9 本が 2.0〜2.6 秒、つまり 5 秒
 * 予算の 40〜52% を消費し、1 本が 5 秒を超えて node-postgres の
 * `Connection terminated due to connection timeout` になった。30 日で 25 件、
 * すべて毎時 00 分の cron バースト。Cloud Scheduler の retry は 45 秒後に 0.08 秒で
 * 成功しており、DB は落ちていない。**予算が復帰時間より短いだけ**だった。
 *
 * そこで Neon 公式が node-postgres 向けに書いている値をそのまま使う
 * （`connectionTimeoutMillis: 10000`）。
 * @see https://neon.com/docs/connect/connection-latency
 *
 * この option は pg.Pool では**新規接続の確立**と**満杯時の acquire 待ち**を兼ねる
 * （node-postgres は 1 つの値で両方を切る）ので、枯渇の検知も 5s → 10s に遅くなる。
 * `statement_timeout` 15s と直列で踏んでも最悪 25 秒で、Cloud Run の request timeout
 * 300 秒には収まる。
 *
 * - `idleTimeoutMillis: 300_000` (v6 max_idle_connection_lifetime)
 *   v7 デフォルト（idle 10s）は短すぎて Cloud Run のコールドスタート直後に切断される。
 * 値は validated server env で上書きできるが、未指定時はこの既定を使う。
 *
 * サーバー側クエリ／トランザクション上限（プール枯渇対策）:
 * - `statement_timeout` … 1 クエリの最大実行時間。これが無いと runaway / lock 待ちの
 *   1 クエリが接続を無制限に占有し、concurrency=80 / pool=10 の単一インスタンスで
 *   残り接続を巻き込み acquire timeout 由来の 500 を誘発する。
 * - `idle_in_transaction_session_timeout` … トランザクション内でアイドル放置された
 *   接続を打ち切り、ハングした BEGIN がプールを食い潰すのを防ぐ。
 * いずれも `pg.Pool` が全 client に転送する（node-postgres 公式）。値は正規の
 * 管理レポート／エクスポートより十分長い 15s に設定（runaway のみを打ち切る）。
 *
 * `onPoolError` / `onConnectionError` は**第 2 引数**（`PrismaPgOptions`）に置く。
 * 第 1 引数は `pg.PoolConfig` としてそのまま node-postgres に渡り、実行時に捨てられる。
 * object literal 直書きなら余剰プロパティ検査が TS2353 で止めるが、設定を変数に
 * 組んでから渡すと型も素通りする（実測）。配線は
 * `__tests__/unit/db/prisma-pool-error-wiring.test.ts` が固定している。
 */
const adapter = new PrismaPg(
  {
    connectionString: serverEnv.DATABASE_URL,
    connectionTimeoutMillis: serverEnv.DATABASE_CONNECTION_TIMEOUT_MS ?? 10_000,
    idleTimeoutMillis: serverEnv.DATABASE_IDLE_TIMEOUT_MS ?? 300_000,
    max: serverEnv.DATABASE_POOL_MAX ?? 10,
    statement_timeout: serverEnv.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000,
    idle_in_transaction_session_timeout:
      serverEnv.DATABASE_IDLE_IN_TRANSACTION_SESSION_TIMEOUT_MS ?? 15_000,
  },
  {
    onPoolError: (error) => logPoolError("idlePoolClient", error),
    onConnectionError: (error) => logPoolError("transactionConnection", error),
  },
);

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
