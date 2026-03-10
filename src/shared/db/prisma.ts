/**
 * Prisma Client Singleton
 *
 * Prisma 7 では接続リークを防ぐため、シングルトンパターンで実装します。
 * 開発環境では Hot Reload 時に新しいインスタンスが作成されないようにします。
 */

import "server-only";

import { PrismaPg } from "@prisma/adapter-pg";
import { serverEnv } from "@/shared/lib/env/server";
import {
  PrismaClient,
  Role,
  Prisma,
  type Space as PrismaSpace,
  type Reservation as PrismaReservation,
  type Customer as PrismaCustomer,
  type Settings as PrismaSettings,
  type Coupon as PrismaCoupon,
} from "@generated/prisma/client";
import type { Decimal } from "@prisma/client/runtime/client";

export { Role, Prisma, PrismaClient };

/**
 * Decimal → number 変換ユーティリティ型
 * Decimal型のみを変換し、他の型はそのまま保持する
 */
type ConvertDecimalFields<T> = {
  [K in keyof T]: T[K] extends Decimal
    ? number
    : T[K] extends Decimal | null
      ? number | null
      : T[K];
};

/**
 * Extended Prisma types with Decimal converted to number
 */
export type Space = ConvertDecimalFields<PrismaSpace>;
export type Reservation = ConvertDecimalFields<PrismaReservation>;
export type Customer = ConvertDecimalFields<PrismaCustomer>;
export type Settings = ConvertDecimalFields<PrismaSettings>;
export type Coupon = ConvertDecimalFields<PrismaCoupon>;

// Prisma アダプター（PrismaPg が Pool ライフサイクルを内部管理）
const adapter = new PrismaPg({
  connectionString: serverEnv.DATABASE_URL,
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 10000,
  max:
    serverEnv.DATABASE_POOL_MAX ??
    (serverEnv.NODE_ENV === "production" ? 3 : 5),
});

// グローバル変数（型は src/shared/types/global.d.ts で定義）
const globalForPrisma = globalThis;

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
      serverEnv.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });

// 開発環境ではグローバル変数に保存
if (serverEnv.NODE_ENV !== "production") {
  globalForPrisma.prisma = basePrisma;
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
          return reservation.totalPrice ? Number(reservation.totalPrice) : null;
        },
      },
      basePrice: {
        needs: { basePrice: true },
        compute(reservation) {
          return reservation.basePrice ? Number(reservation.basePrice) : null;
        },
      },
      couponDiscountAmount: {
        needs: { couponDiscountAmount: true },
        compute(reservation) {
          return reservation.couponDiscountAmount
            ? Number(reservation.couponDiscountAmount)
            : null;
        },
      },
      durationDiscountAmount: {
        needs: { durationDiscountAmount: true },
        compute(reservation) {
          return reservation.durationDiscountAmount
            ? Number(reservation.durationDiscountAmount)
            : null;
        },
      },
      spaceDiscountAmount: {
        needs: { spaceDiscountAmount: true },
        compute(reservation) {
          return reservation.spaceDiscountAmount
            ? Number(reservation.spaceDiscountAmount)
            : null;
        },
      },
      taxRate: {
        needs: { taxRate: true },
        compute(reservation) {
          return reservation.taxRate ? Number(reservation.taxRate) : null;
        },
      },
      taxAmount: {
        needs: { taxAmount: true },
        compute(reservation) {
          return reservation.taxAmount ? Number(reservation.taxAmount) : null;
        },
      },
      totalPriceWithTax: {
        needs: { totalPriceWithTax: true },
        compute(reservation) {
          return reservation.totalPriceWithTax
            ? Number(reservation.totalPriceWithTax)
            : null;
        },
      },
    },
    space: {
      area: {
        needs: { area: true },
        compute(space) {
          return space.area ? Number(space.area) : null;
        },
      },
      hourlyPrice: {
        needs: { hourlyPrice: true },
        compute(space) {
          return Number(space.hourlyPrice);
        },
      },
      dailyPrice: {
        needs: { dailyPrice: true },
        compute(space) {
          return space.dailyPrice ? Number(space.dailyPrice) : null;
        },
      },
      discountValue: {
        needs: { discountValue: true },
        compute(space) {
          return space.discountValue ? Number(space.discountValue) : null;
        },
      },
    },
    customer: {
      totalSpent: {
        needs: { totalSpent: true },
        compute(customer) {
          return customer.totalSpent ? Number(customer.totalSpent) : null;
        },
      },
    },
    settings: {
      taxStandardRate: {
        needs: { taxStandardRate: true },
        compute(settings) {
          return Number(settings.taxStandardRate);
        },
      },
      taxReducedRate: {
        needs: { taxReducedRate: true },
        compute(settings) {
          return Number(settings.taxReducedRate);
        },
      },
    },
    coupon: {
      discountValue: {
        needs: { discountValue: true },
        compute(coupon) {
          return Number(coupon.discountValue);
        },
      },
      minReservationAmount: {
        needs: { minReservationAmount: true },
        compute(coupon) {
          return coupon.minReservationAmount
            ? Number(coupon.minReservationAmount)
            : null;
        },
      },
      maxDiscountAmount: {
        needs: { maxDiscountAmount: true },
        compute(coupon) {
          return coupon.maxDiscountAmount
            ? Number(coupon.maxDiscountAmount)
            : null;
        },
      },
    },
  },
});

export default prisma;
