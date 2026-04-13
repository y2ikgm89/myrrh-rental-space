import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray } from "@/shared/lib/serialize";

export type SpaceOption = {
  id: string;
  name: string;
  descriptionPlainText: string;
  capacity: number;
  area: number | null;
  hourlyPrice: number;
  dailyPrice: number | null;
  mainImageUrl: string;
  imageUrls: string[];
  facilities: string[];
};

export type LocationWithSpaces = {
  id: string;
  name: string;
  address: string;
  imageUrl: string;
  spaces: SpaceOption[];
};

/**
 * 公開済み Location と配下の公開済み Space を取得（予約フォーム用）
 */
export async function getPublishedLocationsWithSpaces(): Promise<
  LocationWithSpaces[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES, CACHE_TAGS.LOCATIONS);

  const locations = await safeFetch({
    fetch: () =>
      prisma.location.findMany({
        where: { isPublished: true, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          address: true,
          imageUrl: true,
          spaces: {
            where: { isPublished: true, isActive: true },
            orderBy: { name: "asc" },
            select: {
              id: true,
              name: true,
              descriptionPlainText: true,
              capacity: true,
              area: true,
              hourlyPrice: true,
              dailyPrice: true,
              mainImageUrl: true,
              imageUrls: true,
              facilities: true,
            },
          },
        },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedLocationsWithSpaces",
  });

  return toPlainArray(
    locations
      .filter((l) => l.spaces.length > 0)
      .map((l) => ({
        ...l,
        spaces: l.spaces.map((s) => ({
          ...s,
          imageUrls: Array.isArray(s.imageUrls)
            ? s.imageUrls.filter((u): u is string => typeof u === "string")
            : [],
          facilities: Array.isArray(s.facilities)
            ? s.facilities.filter((f): f is string => typeof f === "string")
            : [],
        })),
      })),
  );
}
