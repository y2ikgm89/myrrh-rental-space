/**
 * Prisma Client Singleton
 *
 * Prisma 7 では接続リークを防ぐため、シングルトンパターンで実装します。
 * 開発環境では Hot Reload 時に新しいインスタンスが作成されないようにします。
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client/client'
import { Pool } from 'pg'

export { Role } from '@/generated/prisma/client/client'

// PostgreSQL 接続プール
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
})

// Prisma アダプター
const adapter = new PrismaPg(pool)

// グローバル変数の型定義
const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

/**
 * Prisma Client インスタンス
 *
 * - 開発環境: グローバル変数に保存して再利用
 * - 本番環境: 新しいインスタンスを作成
 */
export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log:
      process.env.NODE_ENV === 'development'
        ? ['query', 'error', 'warn']
        : ['error'],
  })

// 開発環境ではグローバル変数に保存
if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma
}

export default prisma
