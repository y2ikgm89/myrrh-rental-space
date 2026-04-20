import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";

export async function getReservationDeadlineSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findFirstOrThrow({
        select: {
          cancellationDeadlineHours: true,
          modificationDeadlineHours: true,
        },
      }),
    fallback: { cancellationDeadlineHours: 24, modificationDeadlineHours: 24 },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getReservationDeadlineSettings",
  });

  return toPlainObject(result);
}

/**
 * サイト全体のレビュー機能 global gate（multi-tenant SaaS pattern）
 *
 * `Settings.reviewsEnabledGlobal` を公開側から取得する軽量ヘルパー。
 * UI gate（ReviewForm outer gate 等）で per-space toggle との AND 判定に使う。
 */
export async function getReviewsEnabledGlobal(): Promise<boolean> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findFirstOrThrow({
        select: { reviewsEnabledGlobal: true },
      }),
    fallback: { reviewsEnabledGlobal: true },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getReviewsEnabledGlobal",
  });

  return result.reviewsEnabledGlobal;
}
