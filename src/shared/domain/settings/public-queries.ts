import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { parseRefundPolicy } from "@/shared/domain/refund/policy";
import type { RefundPolicy } from "@/shared/domain/refund/policy";
import { toPlainObject } from "@/shared/lib/serialize";

export async function getReservationDeadlineSettings() {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settingsReservation.findFirstOrThrow({
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
 * 公開サイト向けの返金ポリシー。`SettingsCommerce.refundPolicy` を parse し、
 * 未設定 / shape 不正は null（表示なし = キャンセル時は残額全額返金の後方互換）。
 * 秘密情報は含まない。
 */
export async function getPublicRefundPolicySettings(): Promise<RefundPolicy | null> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settingsCommerce.findUnique({
        where: { id: "singleton" },
        select: { refundPolicy: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicRefundPolicySettings",
  });

  if (!result) return null;
  return parseRefundPolicy(result.refundPolicy);
}
