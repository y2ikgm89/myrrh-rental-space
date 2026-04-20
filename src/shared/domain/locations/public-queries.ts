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
 * 有効な拠点一覧を取得（フィルタ UI 用）
 *
 * `getPublishedLocationsWithSpaces` は予約フォーム向けに spaces を入子で持ち重い。
 * 一覧フィルタは `id` / `name` のみで十分なため軽量クエリを別途提供する。
 */
export type LocationOption = {
  readonly id: string;
  readonly name: string;
};

export async function getActiveLocations(): Promise<LocationOption[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const locations = await safeFetch({
    fetch: () =>
      prisma.location.findMany({
        where: { isPublished: true, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: { id: true, name: true },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveLocations",
  });

  return toPlainArray(locations);
}

/**
 * /access ページ用: 公開済み Location をアクセス情報フル取得
 *
 * 各拠点の住所・交通案内・営業時間・建物画像を含む。
 * BusinessHours JSON は Client Component 表示用に Json をそのまま返す。
 */
export type LocationForAccess = {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly address: string;
  readonly access: string | null;
  readonly parkingInfo: string | null;
  readonly amenities: unknown;
  readonly imageUrl: string;
  readonly businessHours: unknown;
};

export async function getPublishedLocationsForAccess(): Promise<
  LocationForAccess[]
> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.LOCATIONS);

  const locations = await safeFetch({
    fetch: () =>
      prisma.location.findMany({
        where: { isPublished: true, isActive: true },
        orderBy: { sortOrder: "asc" },
        select: {
          id: true,
          name: true,
          description: true,
          address: true,
          access: true,
          parkingInfo: true,
          amenities: true,
          imageUrl: true,
          businessHours: true,
        },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedLocationsForAccess",
  });

  return toPlainArray(locations);
}

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
