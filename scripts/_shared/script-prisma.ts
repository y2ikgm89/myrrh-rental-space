/**
 * scripts 用 Prisma クライアント factory（SSoT）
 *
 * 全ての CLI スクリプトは `@/shared/db/prisma`（`server-only` 付き）を直接 import できないため、
 * adapter のセットアップが各 script に散らばっていた。本 module で:
 *
 * - `createScriptPrismaClient()` … adapter-pg + PrismaClient を 1 行で生成
 * - `withScript(name, fn)` … 接続 → 実行 → 切断 → 例外ハンドリングをラップ。
 *
 * Bun runtime は `.env` / `.env.local` を自動読み込みするため dotenv 不要。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";

export type ScriptPrismaOptions = {
  /** pg.Pool の最大接続数。script は単発実行なので 2 程度で十分（default: 2）。 */
  poolMax?: number;
};

export type ScriptPrismaClient = {
  prisma: PrismaClient;
  disconnect: () => Promise<void>;
};

/**
 * scripts 用 Prisma クライアントを組み立てる。
 *
 * `DATABASE_URL` が無い場合は stderr に出して process.exit(1)。
 */
export function createScriptPrismaClient(
  options: ScriptPrismaOptions = {},
): ScriptPrismaClient {
  const databaseUrl = process.env["DATABASE_URL"];
  if (!databaseUrl) {
    console.error("❌ DATABASE_URL が設定されていません");
    process.exit(1);
  }

  const adapter = new PrismaPg({
    connectionString: databaseUrl,
    // アプリ本番（src/shared/db/prisma.ts）と同じ Neon 公式の connect 予算。
    // script は本番 Neon に直接つなぐこともあり、同じ cold start を踏む。
    connectionTimeoutMillis: 10_000,
    idleTimeoutMillis: 300_000,
    max: options.poolMax ?? 2,
  });

  const prisma = new PrismaClient({ adapter });

  return {
    prisma,
    disconnect: () => prisma.$disconnect(),
  };
}

/**
 * script のエントリーポイントをラップするヘルパー。
 */
export async function withScript(
  name: string,
  fn: (prisma: ScriptPrismaClient["prisma"]) => Promise<void>,
  options: ScriptPrismaOptions = {},
): Promise<void> {
  const client = createScriptPrismaClient(options);
  try {
    await fn(client.prisma);
  } catch (error) {
    console.error(
      `❌ ${name} failed:`,
      error instanceof Error ? error.message : String(error),
    );
    await client.disconnect();
    process.exit(1);
  }
  await client.disconnect();
}
