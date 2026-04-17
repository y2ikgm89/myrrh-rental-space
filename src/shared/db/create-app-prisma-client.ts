/**
 * アプリ標準の Prisma クライアント組み立て（Decimal → number の result 拡張）
 *
 * Next の singleton（`prisma.ts`）と `prisma/seed.ts` の両方から同じ `$extends` を適用する。
 * これにより `AppPrismaClient` が一意になり、seed とアプリで型・挙動が揃う。
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/client-extensions/result
 */

import { PrismaClient } from "@generated/prisma/client";

type DecimalLike = { toString(): string } | null | undefined;

/**
 * Decimal フィールドを number に変換する result 拡張の factory。
 * Prisma の `$extends` API が `needs` の型推論を行えるようにモデル名毎にインライン展開する。
 */
function decimalToNumber(value: DecimalLike): number | null {
  return value ? Number(value) : null;
}

function decimalToNumberStrict(value: DecimalLike): number {
  return Number(value);
}

export function createAppPrismaClient(base: PrismaClient) {
  return base.$extends({
    result: {
      reservation: {
        totalPrice: {
          needs: { totalPrice: true },
          compute: (r) => decimalToNumber(r.totalPrice),
        },
        basePrice: {
          needs: { basePrice: true },
          compute: (r) => decimalToNumber(r.basePrice),
        },
        couponDiscountAmount: {
          needs: { couponDiscountAmount: true },
          compute: (r) => decimalToNumber(r.couponDiscountAmount),
        },
        durationDiscountAmount: {
          needs: { durationDiscountAmount: true },
          compute: (r) => decimalToNumber(r.durationDiscountAmount),
        },
        spaceDiscountAmount: {
          needs: { spaceDiscountAmount: true },
          compute: (r) => decimalToNumber(r.spaceDiscountAmount),
        },
        taxRate: {
          needs: { taxRate: true },
          compute: (r) => decimalToNumber(r.taxRate),
        },
        taxAmount: {
          needs: { taxAmount: true },
          compute: (r) => decimalToNumber(r.taxAmount),
        },
        totalPriceWithTax: {
          needs: { totalPriceWithTax: true },
          compute: (r) => decimalToNumber(r.totalPriceWithTax),
        },
      },
      space: {
        area: {
          needs: { area: true },
          compute: (s) => decimalToNumber(s.area),
        },
        hourlyPrice: {
          needs: { hourlyPrice: true },
          compute: (s) => decimalToNumberStrict(s.hourlyPrice),
        },
        dailyPrice: {
          needs: { dailyPrice: true },
          compute: (s) => decimalToNumber(s.dailyPrice),
        },
        discountValue: {
          needs: { discountValue: true },
          compute: (s) => decimalToNumber(s.discountValue),
        },
      },
      customer: {
        totalSpent: {
          needs: { totalSpent: true },
          compute: (c) => decimalToNumber(c.totalSpent),
        },
      },
      settings: {
        taxStandardRate: {
          needs: { taxStandardRate: true },
          compute: (s) => decimalToNumberStrict(s.taxStandardRate),
        },
        taxReducedRate: {
          needs: { taxReducedRate: true },
          compute: (s) => decimalToNumberStrict(s.taxReducedRate),
        },
      },
      coupon: {
        discountValue: {
          needs: { discountValue: true },
          compute: (c) => decimalToNumberStrict(c.discountValue),
        },
        minReservationAmount: {
          needs: { minReservationAmount: true },
          compute: (c) => decimalToNumber(c.minReservationAmount),
        },
        maxDiscountAmount: {
          needs: { maxDiscountAmount: true },
          compute: (c) => decimalToNumber(c.maxDiscountAmount),
        },
      },
    },
  });
}

export type AppPrismaClient = ReturnType<typeof createAppPrismaClient>;
