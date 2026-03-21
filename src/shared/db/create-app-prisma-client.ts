/**
 * アプリ標準の Prisma クライアント組み立て（Decimal → number の result 拡張）
 *
 * Next の singleton（`prisma.ts`）と `prisma/seed.ts` の両方から同じ `$extends` を適用する。
 * これにより `AppPrismaClient` が一意になり、seed とアプリで型・挙動が揃う。
 */

import { PrismaClient } from "@generated/prisma/client";

export function createAppPrismaClient(base: PrismaClient) {
  return base.$extends({
    result: {
      reservation: {
        totalPrice: {
          needs: { totalPrice: true },
          compute(reservation) {
            return reservation.totalPrice
              ? Number(reservation.totalPrice)
              : null;
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
}

export type AppPrismaClient = ReturnType<typeof createAppPrismaClient>;
