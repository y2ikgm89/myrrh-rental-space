/**
 * Prisma 7 Configuration
 *
 * Bun runtime が `.env` / `.env.local` を自動読み込みする公式仕様（.env.local が
 * .env を上書き）のため dotenv パッケージは不要。`bunx --bun prisma ...` 経由で
 * 起動した時点で `process.env` に展開済み。
 *
 * Neon 公式: CLI（migrate / db push / introspect）は direct 接続 (`DIRECT_URL`)。
 * アプリ runtime の Prisma Client は `DATABASE_URL`（`-pooler`）を使う。
 * ローカル docker Postgres では両方を同じ URL にしてよい。
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 * @see https://bun.com/docs/runtime/env
 * @see https://neon.com/docs/guides/prisma-migrations
 */

import { defineConfig, env } from "prisma/config";

/**
 * Neon 公式は CLI を `DIRECT_URL` 固定。ローカル docker では未設定時に
 * `DATABASE_URL` へフォールバックし、既存 `.env.local` を壊さない。
 */
function resolvePrismaCliDatasourceUrl(): string {
  const direct = process.env["DIRECT_URL"]?.trim();
  if (direct) return direct;
  const databaseUrl = process.env["DATABASE_URL"]?.trim();
  if (databaseUrl) return databaseUrl;
  // どちらも無いときだけ Prisma の公式 env() エラーに寄せる
  return env("DIRECT_URL");
}

export default defineConfig({
  // パスは prisma.config.ts の場所から相対パスで解決される
  schema: "prisma/schema.prisma",
  datasource: {
    url: resolvePrismaCliDatasourceUrl(),
  },
  migrations: {
    seed: "bun prisma/seed.ts",
  },
});
