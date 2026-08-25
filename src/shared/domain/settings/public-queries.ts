import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { resolveRefundPolicy } from "@/shared/domain/refund/policy";
import type { RefundPolicy } from "@/shared/domain/refund/policy";
import { toPlainObject } from "@/shared/lib/serialize";

/**
 * キャンセル / 変更の締切時間。**`"use cache"` に載せない。**
 *
 * admin と public は別の Cloud Run サービスで、既定キャッシュハンドラは
 * プロセス内メモリなので admin の `updateTag(BUSINESS_SETTINGS)` は public の
 * Data Cache に届かない（共有 cacheHandler は未配線）。この値は表示ではなく
 * **キャンセル可否そのもの**を決める:
 *
 * - `cancelCustomerReservation` / `cancelReservationByToken` → 締切内なら
 *   キャンセル成立 → 自動返金の発火条件
 * - `updateCustomerReservation` / `updateGuestReservationByToken` → 変更可否
 *
 * 長寿命キャッシュに載せると、管理画面で締切を締めても public は最大 24 時間
 * 旧値で「締切内」と判定し、返金まで走る。利用者からは一貫して正しく見えるので
 * 事後の返金差異でしか気づけない。
 *
 * 同ファイルの `getPublicRefundPolicySettings` は**表示用**なのでキャッシュ可。
 * この非対称は `__tests__/unit/architecture-boundaries.test.ts` が関数単位で固定する。
 */
export async function getReservationDeadlineSettings() {
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
 * 公開サイト向けの返金ポリシー。`SettingsCommerce.refundPolicy` を解決し、
 * `configured` のときだけ表示用 policy を返す。
 * `unset` / `invalid` / DB 失敗は null（表示なし）。自動返金の判定は cancel
 * side-effects 側の `resolveRefundPolicy` が SSoT（invalid は fail-closed）。
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
  const resolution = resolveRefundPolicy(result.refundPolicy);
  return resolution.status === "configured" ? resolution.policy : null;
}
