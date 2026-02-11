/**
 * Prisma Client Singleton
 *
 * Prisma 7 では接続リークを防ぐため、シングルトンパターンで実装します。
 * 開発環境では Hot Reload 時に新しいインスタンスが作成されないようにします。
 */

import { PrismaPg } from '@prisma/adapter-pg'
import {
  PrismaClient,
  Role,
  Prisma,
  type Space as PrismaSpace,
  type Reservation as PrismaReservation,
  type Customer as PrismaCustomer,
} from '@/shared/generated/prisma/client'
import type { Decimal } from '@prisma/client/runtime/client'

export { Role, Prisma }

/**
 * Decimal → number 変換ユーティリティ型
 * Decimal型のみを変換し、他の型はそのまま保持する
 */
type ConvertDecimalFields<T> = {
  [K in keyof T]: T[K] extends Decimal
    ? number
    : T[K] extends Decimal | null
      ? number | null
      : T[K]
}

/**
 * Extended Prisma types with Decimal converted to number
 */
export type Space = ConvertDecimalFields<PrismaSpace>
export type Reservation = ConvertDecimalFields<PrismaReservation>
export type Customer = ConvertDecimalFields<PrismaCustomer>

// Prisma アダプター（PrismaPg が Pool ライフサイクルを内部管理）
const adapter = new PrismaPg({
  connectionString: process.env.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  max: process.env.DATABASE_POOL_MAX
    ? Number(process.env.DATABASE_POOL_MAX)
    : process.env.NODE_ENV === 'production'
      ? 3
      : 5,
})

// グローバル変数（型は src/shared/types/global.d.ts で定義）
const globalForPrisma = globalThis

/**
 * Base Prisma Client インスタンス
 *
 * - 開発環境: グローバル変数に保存して再利用
 * - 本番環境: 新しいインスタンスを作成
 */
const basePrisma =
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
  globalForPrisma.prisma = basePrisma
}

/**
 * Prisma Client with Decimal to Number conversion
 *
 * Decimal型を自動的にnumberに変換する拡張を追加
 * これにより、手動で Number() を呼び出す必要がなくなります
 */
export const prisma = basePrisma.$extends({
  result: {
    reservation: {
      totalPrice: {
        needs: { totalPrice: true },
        compute(reservation) {
          return reservation.totalPrice ? Number(reservation.totalPrice) : null
        },
      },
    },
    space: {
      area: {
        needs: { area: true },
        compute(space) {
          return space.area ? Number(space.area) : null
        },
      },
      hourlyPrice: {
        needs: { hourlyPrice: true },
        compute(space) {
          return Number(space.hourlyPrice)
        },
      },
      dailyPrice: {
        needs: { dailyPrice: true },
        compute(space) {
          return space.dailyPrice ? Number(space.dailyPrice) : null
        },
      },
    },
    customer: {
      totalSpent: {
        needs: { totalSpent: true },
        compute(customer) {
          return customer.totalSpent ? Number(customer.totalSpent) : null
        },
      },
    },
  },
})

export default prisma
