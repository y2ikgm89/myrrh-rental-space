import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { parseFeatureModules } from "@/shared/lib/json-validators";

/**
 * 機能モジュール ON/OFF map（Settings.featureModules JSON column の正規化結果）
 *
 * - `Settings.featureModules` が `{}` または不正な形式の場合は空オブジェクトを返す
 * - 値が boolean でないキーは silently 除外（`parseFeatureModules` の防御的パース）
 * - 完全な module 一覧 + デフォルト解決は `@/shared/lib/features/check.ts` の責務
 */
export type FeatureModulesMap = Record<string, boolean>;

export async function getFeatureModulesSettings(): Promise<FeatureModulesMap> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.FEATURE_MODULES);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: { featureModules: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getFeatureModulesSettings",
  });

  return parseFeatureModules(result?.featureModules);
}
