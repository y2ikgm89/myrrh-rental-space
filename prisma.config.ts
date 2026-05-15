/**
 * Prisma 7 Configuration
 *
 * Bun runtime が `.env` / `.env.local` を自動読み込みする公式仕様（.env.local が
 * .env を上書き）のため dotenv パッケージは不要。`bunx --bun prisma ...` 経由で
 * 起動した時点で `process.env` に展開済み。
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 * @see https://bun.com/docs/runtime/env
 */

import { defineConfig, env } from "prisma/config";

export default defineConfig({
  // パスは prisma.config.ts の場所から相対パスで解決される
  schema: "prisma/schema.prisma",
  datasource: {
    url: env("DATABASE_URL"),
  },
  migrations: {
    seed: "bun prisma/seed.ts",
  },
});
