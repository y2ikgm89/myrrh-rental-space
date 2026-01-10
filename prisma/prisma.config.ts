/**
 * Prisma 7 Configuration
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */

import { config } from 'dotenv'
import { defineConfig, env } from 'prisma/config'

// プロジェクトルートから実行されるため、直接パスを指定
config({ path: '.env.local', override: true })
config({ path: '.env', override: false })

export default defineConfig({
  schema: 'schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
