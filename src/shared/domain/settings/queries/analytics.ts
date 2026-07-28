import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import {
  getAnalyticsConfig as getAnalyticsConfigUncached,
  type AnalyticsConfig,
} from "@/shared/domain/settings/queries/site";
import { CACHE_TAGS, CACHE_LIFE } from "@/shared/lib/constants";

export type { AnalyticsConfig };

export async function getAnalyticsConfig(): Promise<AnalyticsConfig> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.ANALYTICS_CONFIG);

  return getAnalyticsConfigUncached();
}
