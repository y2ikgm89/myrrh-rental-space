/**
 * Analytics設定取得ヘルパー
 *
 * DBからAnalytics関連の設定を取得する
 * Next.js 16 'use cache' ディレクティブによる明示的キャッシュ制御
 *
 * @module shared/lib/analytics/config
 */

import { cacheLife, cacheTag } from "next/cache";
export type { AnalyticsConfig } from "@/shared/domain/settings/queries/site";
import * as siteQueries from "@/shared/domain/settings/queries/site";
import type { AnalyticsConfig } from "@/shared/domain/settings/queries/site";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

/**
 * デフォルトのAnalytics設定（DB取得失敗時のフォールバック）
 */
function getDefaultAnalyticsConfig(): AnalyticsConfig {
  return {
    analyticsType: null,
    googleAnalyticsId: null,
    googleTagManagerId: null,
    googleSearchConsoleId: null,
    bingWebmasterToolsId: null,
    gaPropertyId: null,
  };
}

/**
 * Analytics設定を取得（キャッシュ付き）
 *
 * Next.js 16 'use cache' パターン:
 * - cacheLife(CACHE_LIFE.STATIC_SETTINGS): 1時間キャッシュ
 * - cacheTag: `CACHE_TAGS.ANALYTICS_CONFIG`（無効化は `updateTag` + 定数経由）
 */
export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANALYTICS_CONFIG);

  try {
    return await siteQueries.getAnalyticsConfig();
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: "getAnalyticsConfig" },
    });
    return getDefaultAnalyticsConfig();
  }
}
