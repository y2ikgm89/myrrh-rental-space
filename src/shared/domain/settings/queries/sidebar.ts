import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  safeFetch,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  parseSidebarWidgets,
  DEFAULT_SIDEBAR_WIDGETS,
  type SidebarWidget,
} from "@/shared/lib/validations/sidebar";

export interface PublicSidebarSettings {
  enabled: boolean;
  widgets: SidebarWidget[];
  recentCount: number;
  popularCount: number;
}

const DEFAULTS: PublicSidebarSettings = {
  enabled: true,
  widgets: DEFAULT_SIDEBAR_WIDGETS,
  recentCount: 5,
  popularCount: 5,
};

export async function getSidebarSettings(): Promise<PublicSidebarSettings> {
  "use cache";
  cacheLife(CACHE_LIFE.STATIC_SETTINGS);
  cacheTag(CACHE_TAGS.SIDEBAR_SETTINGS);

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: "singleton" },
        select: {
          sidebarEnabled: true,
          sidebarWidgets: true,
          sidebarRecentCount: true,
          sidebarPopularCount: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSidebarSettings",
  });

  if (!result) return DEFAULTS;

  return {
    enabled: result.sidebarEnabled,
    widgets: parseSidebarWidgets(result.sidebarWidgets),
    recentCount: result.sidebarRecentCount,
    popularCount: result.sidebarPopularCount,
  };
}
