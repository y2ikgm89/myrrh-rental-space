/**
 * Prisma 7 Configuration
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */

import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// .env ファイルを読み込み（設定ファイルの場所から相対パス）
config({ path: '.env.local', override: true })
config({ path: '.env', override: false })

export default defineConfig({
  // パスは prisma.config.ts の場所から相対パスで解決される
  schema: 'prisma/schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
  migrations: {
    seed: 'bun prisma/seed.ts',
  },
})
