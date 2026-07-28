import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import { criticalFetch, ErrorCategory } from "@/shared/lib/errors/server";
import { parseFeatureModules } from "@/shared/lib/json-validators";

/**
 * 機能モジュール ON/OFF map（SettingsFeatures.featureModules JSON column の正規化結果）
 *
 * - DB 取得成功時: `{}` / 不正形式 / 欠落 key → 空オブジェクト（欠落 key は fail-closed OFF）
 * - DB 取得失敗時: `criticalFetch` が throw → Data Cache に失敗結果を書かない
 *   （旧 `safeFetch({ fallback: null })` は blip を `{}` = 全 OFF として days キャッシュしていた）
 * - 完全な module 一覧 + デフォルト解決は `@/shared/lib/features/check.ts` の責務
 */
export type FeatureModulesMap = Record<string, boolean>;

export async function getFeatureModulesSettings(): Promise<FeatureModulesMap> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.FEATURE_MODULES);

  const result = await criticalFetch({
    fetch: () =>
      prisma.settingsFeatures.findUnique({
        where: { id: "singleton" },
        select: { featureModules: true },
      }),
    category: ErrorCategory.DATABASE,
    operationName: "getFeatureModulesSettings",
  });

  return parseFeatureModules(result?.featureModules);
}
