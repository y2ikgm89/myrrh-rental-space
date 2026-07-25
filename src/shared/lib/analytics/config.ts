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

/**
 * Analytics設定を取得（キャッシュ付き）
 *
 * Next.js 16 'use cache' パターン:
 * - cacheLife(CACHE_LIFE.STATIC_SETTINGS)
 * - cacheTag: `CACHE_TAGS.ANALYTICS_CONFIG`（無効化は `updateTag` + 定数経由）
 *
 * DB 失敗時はフォールバックを返さない（成功レスポンスとして空設定をキャッシュすると
 * 一時障害が長期固定化する）。呼び出し側（AnalyticsCard 等）でエラー UI を出す。
 */
export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANALYTICS_CONFIG);

  return siteQueries.getAnalyticsConfig();
}
