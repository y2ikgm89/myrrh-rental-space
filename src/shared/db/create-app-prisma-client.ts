/**
 * アプリ標準の Prisma クライアント組み立て（Decimal → number の result 拡張）
 *
 * Next の singleton（`prisma.ts`）と `prisma/seed.ts` の両方から同じ `$extends` を適用する。
 * これにより `AppPrismaClient` が一意になり、seed とアプリで型・挙動が揃う。
 *
 * 金額（円）は schema 上 Int のため拡張不要。率（taxRate 等）と area のみ Decimal 残存。
 *
 * @see https://www.prisma.io/docs/orm/prisma-client/client-extensions/result
 */

import { PrismaClient } from "@generated/prisma/client";

type DecimalLike = { toString(): string } | null | undefined;

function decimalToNumber(value: DecimalLike): number | null {
  return value ? Number(value) : null;
}

function decimalToNumberStrict(value: DecimalLike): number {
  return Number(value);
}

export function createAppPrismaClient(base: PrismaClient) {
  return base.$extends({
    result: {
      space: {
        area: {
          needs: { area: true },
          compute: (s) => decimalToNumber(s.area),
        },
      },
      settingsCommerce: {
        taxStandardRate: {
          needs: { taxStandardRate: true },
          compute: (s) => decimalToNumberStrict(s.taxStandardRate),
        },
        taxReducedRate: {
          needs: { taxReducedRate: true },
          compute: (s) => decimalToNumberStrict(s.taxReducedRate),
        },
      },
      receipt: {
        taxRate: {
          needs: { taxRate: true },
          compute: (r) => decimalToNumberStrict(r.taxRate),
        },
      },
      reservation: {
        taxRate: {
          needs: { taxRate: true },
          compute: (r) => decimalToNumber(r.taxRate),
        },
      },
    },
  });
}

export type AppPrismaClient = ReturnType<typeof createAppPrismaClient>;
