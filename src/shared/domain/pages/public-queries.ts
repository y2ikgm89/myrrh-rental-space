import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainObject } from "@/shared/lib/serialize";

/**
 * Get Puck editor JSON data for the homepage.
 * Returns null if no puckData has been saved yet (fallback to default layout).
 */
export async function getHomepagePuckData(): Promise<unknown> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGES, getCacheTag.pages.detail("home"));

  const result = await safeFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: { slug: "home" },
        select: { puckData: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getHomepagePuckData",
  });

  if (!result) return null;

  return toPlainObject(result).puckData ?? null;
}
