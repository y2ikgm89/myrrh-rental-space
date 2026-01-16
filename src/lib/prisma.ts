/**
 * Prisma Client Singleton
 *
 * Prisma 7 では接続リークを防ぐため、シングルトンパターンで実装します。
 * 開発環境では Hot Reload 時に新しいインスタンスが作成されないようにします。
 */

import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient, Role, Prisma } from '@/generated/prisma/client/client'
import { Pool } from 'pg'

export { Role, Prisma }

// PostgreSQL 接続プール
// Prisma 7 では pg driver のデフォルト設定を使用するため、明示的にタイムアウトを設定
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 接続タイムアウト（デフォルト: 0=無限 → 10秒に設定）
  connectionTimeoutMillis: 10000,
  // アイドル接続のタイムアウト（デフォルト: 10秒）
  idleTimeoutMillis: 10000,
  // 最大接続数（環境に応じて調整）
  // 本番環境: 20接続、開発環境: 5接続
  // 例: 本番 - 20インスタンス × 20接続 = 400接続（Supabase制限内）
  max: process.env.NODE_ENV === 'production' ? 20 : 5,
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
