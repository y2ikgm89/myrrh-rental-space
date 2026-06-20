import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import type { DurationDiscountRule } from "@/shared/lib/pricing/types";

export interface PublicDiscountSettings {
  durationDiscountEnabled: boolean;
  durationDiscountRules: DurationDiscountRule[];
  showOriginalPrice: boolean;
}

const DEFAULT: PublicDiscountSettings = {
  durationDiscountEnabled: false,
  durationDiscountRules: [],
  showOriginalPrice: true,
};

/**
 * 公開予約フォームで使用する長時間割引・価格表示設定。
 *
 * `durationDiscountEnabled` が false の場合は割引を一切適用しない。
 * true の場合は `durationDiscountRules` の中から該当時間に最も長くマッチする
 * ルールを `calculateDurationDiscount` が選び、`showOriginalPrice` が true なら
 * 割引前金額（取消線）と割引後金額の両方を BookingSummary が表示する。
 */
export async function getPublicDiscountSettings(): Promise<PublicDiscountSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          durationDiscountEnabled: true,
          durationDiscountRules: true,
          showOriginalPrice: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicDiscountSettings",
  });

  if (!result) return DEFAULT;

  return {
    durationDiscountEnabled: result.durationDiscountEnabled,
    durationDiscountRules: parseDurationDiscountRules(
      result.durationDiscountRules,
    ),
    showOriginalPrice: result.showOriginalPrice,
  };
}
