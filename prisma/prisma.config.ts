/**
 * Prisma 7 Configuration
 *
 * @see https://www.prisma.io/docs/orm/reference/prisma-config-reference
 */

import 'dotenv/config'
import { defineConfig, env } from 'prisma/config'

export default defineConfig({
  schema: 'schema.prisma',
  datasource: {
    url: env('DATABASE_URL'),
  },
})
