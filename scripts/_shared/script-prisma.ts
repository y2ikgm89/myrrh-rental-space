/**
 * scripts 用 Prisma クライアント factory（SSoT）
 *
 * 全ての CLI スクリプトは `@/shared/db/prisma`（`server-only` 付き）を直接 import できないため、
 * adapter + extends のセットアップが各 script に散らばっていた（`new PrismaPg` × `new PrismaClient`
 * × `createAppPrismaClient` の 3 行を毎回手書き）。本 module で:
 *
 * - `createScriptPrismaClient()` … adapter-pg + アプリ拡張 (`createAppPrismaClient`) を 1 行で生成
 *   - アプリ singleton (`src/shared/db/prisma.ts`) と同じ extends を適用するため、Decimal → number
 *     の型挙動が script でも一致する。
 *   - 内部で生 `basePrisma` も合わせて保持し、`$disconnect()` 用に返す。
 * - `withScript(name, fn)` … 接続 → 実行 → 切断 → 例外ハンドリングをラップ。
 *   - 失敗時は stderr に整形済みエラーを書き出して exit code 1。
 *   - 成功時も必ず `$disconnect()` を呼んで pg.Pool を閉じる（Cloud Run Job で leak を防ぐ）。
 *
 * Bun runtime は `.env` / `.env.local` を自動読み込みするため dotenv 不要。
 */

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "../../generated/prisma/client";
import { createAppPrismaClient } from "@/shared/db/create-app-prisma-client";

export type ScriptPrismaOptions = {
  /** pg.Pool の最大接続数。script は単発実行なので 2 程度で十分（default: 2）。 */
  poolMax?: number;
};

/**
 * scripts 用 Prisma クライアント
 *
 * - `prisma` … `$extends` 適用済み（アプリと同じ Decimal → number 変換）。
 * - `base` … 拡張前の素のクライアント。Better Auth など `$extends` を嫌う依存に渡す用。
 * - `disconnect()` … pg.Pool 切断（base.$disconnect() に委譲）。
 */
export type ScriptPrismaClient = {
  prisma: ReturnType<typeof createAppPrismaClient>;
  base: PrismaClient;
  disconnect: () => Promise<void>;
};

/**
 * scripts 用 Prisma クライアントを組み立てる。
 *
 * `DATABASE_URL` が無い場合は stderr に出して process.exit(1)。
 * 各 script で 3〜5 行重複していた boilerplate を 1 行に集約する。
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
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 300_000,
    max: options.poolMax ?? 2,
  });

  const base = new PrismaClient({ adapter });
  const prisma = createAppPrismaClient(base);

  return {
    prisma,
    base,
    disconnect: () => base.$disconnect(),
  };
}

/**
 * script のエントリーポイントをラップするヘルパー。
 *
 * - 接続 → 実行 → 切断（成功・失敗いずれも）→ 失敗時 exit(1) を 1 関数で。
 * - `fn` は extends 済み `prisma` クライアントを受け取る。base が必要なら
 *   `createScriptPrismaClient()` を直接呼ぶこと（better-auth 等の特殊用途のみ）。
 *
 * @example
 *   await withScript("backfill-foo", async (prisma) => {
 *     const rows = await prisma.foo.findMany();
 *     console.log(`Found ${rows.length} rows`);
 *   });
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
