import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import {
  CACHE_LIFE,
  CACHE_TAGS,
  PAGINATION_DEFAULTS,
  getCacheTag,
} from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import { parseStringArray } from "@/shared/lib/json-validators";
import { formatSpaceLineAddress } from "@/shared/domain/spaces/format-space-line-address";

const spaceListSelect = {
  id: true,
  slug: true,
  name: true,
  descriptionPlainText: true,
  capacity: true,
  area: true,
  hourlyPrice: true,
  dailyPrice: true,
  mainImageUrl: true,
  imageUrls: true,
  facilities: true,
  addressDetail: true,
  reviewsEnabled: true,
  category: { select: { id: true, name: true } },
  location: { select: { name: true, address: true } },
} as const;

type SpaceListRow = Awaited<
  ReturnType<typeof prisma.space.findMany<{ select: typeof spaceListSelect }>>
>[number];

function mapSpaceListItem(s: SpaceListRow) {
  return {
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
    dailyPrice: s.dailyPrice ? Number(s.dailyPrice) : null,
    area: s.area ? Number(s.area) : null,
    imageUrls: parseStringArray(s.imageUrls),
    facilities: parseStringArray(s.facilities),
    lineAddress: formatSpaceLineAddress(s.location.address, s.addressDetail),
  };
}

/**
 * 公開済み・有効なスペース一覧を取得（カテゴリ + 拠点フィルタ）
 */
export async function getPublishedSpaces(
  categoryId?: string,
  locationId?: string,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const spaces = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: {
          isPublished: true,
          isActive: true,
          ...(categoryId ? { categoryId } : {}),
          ...(locationId ? { locationId } : {}),
        },
        select: spaceListSelect,
        orderBy: { name: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedSpaces",
  });

  return toPlainArray(spaces.map(mapSpaceListItem));
}

/**
 * 公開済み・有効なスペース一覧をページネーション付きで取得
 */
export async function getPublishedSpacesPaginated(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
  categoryId?: string,
  locationId?: string,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const where = {
    isPublished: true,
    isActive: true,
    ...(categoryId ? { categoryId } : {}),
    ...(locationId ? { locationId } : {}),
  };

  const skip = (page - 1) * perPage;

  const result = await safeFetch({
    fetch: async () => {
      const [rawItems, totalCount] = await Promise.all([
        prisma.space.findMany({
          where,
          select: spaceListSelect,
          orderBy: { name: "asc" },
          skip,
          take: perPage,
        }),
        prisma.space.count({ where }),
      ]);

      return {
        items: toPlainArray(rawItems.map((s) => mapSpaceListItem(s))),
        totalCount,
        totalPages: Math.ceil(totalCount / perPage),
        currentPage: page,
      };
    },
    fallback: { items: [], totalCount: 0, totalPages: 0, currentPage: page },
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedSpacesPaginated",
  });

  return result;
}

/**
 * スラッグからスペース詳細を取得（公開済み・有効のみ）
 */
export async function getSpaceBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES, getCacheTag.spaces.detail(slug));

  const space = await safeFetch({
    fetch: () =>
      prisma.space.findFirst({
        where: { slug, isPublished: true, isActive: true },
        select: {
          id: true,
          slug: true,
          name: true,
          descriptionJson: true,
          descriptionHtml: true,
          descriptionPlainText: true,
          capacity: true,
          area: true,
          hourlyPrice: true,
          dailyPrice: true,
          mainImageUrl: true,
          imageUrls: true,
          facilities: true,
          addressDetail: true,
          reviewsEnabled: true,
          metaDescription: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
          category: { select: { id: true, name: true } },
          location: {
            select: {
              id: true,
              name: true,
              address: true,
              accessLines: true,
              parkingInfo: true,
            },
          },
          terms: {
            select: {
              title: true,
              slug: true,
              isActive: true,
            },
          },
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getSpaceBySlug",
  });

  if (!space) return null;

  return toPlainObject({
    ...space,
    imageUrls: parseStringArray(space.imageUrls),
    facilities: parseStringArray(space.facilities),
    location: {
      ...space.location,
      accessLines: parseStringArray(space.location.accessLines),
    },
    lineAddress: formatSpaceLineAddress(
      space.location.address,
      space.addressDetail,
    ),
    hourlyPrice: Number(space.hourlyPrice),
    dailyPrice: space.dailyPrice ? Number(space.dailyPrice) : null,
  });
}

/**
 * 関連スペースを取得（同カテゴリ優先、現在のスペースを除外）
 */
export async function getRelatedSpaces(
  currentId: string,
  categoryId: string | null,
  limit = 3,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const spaces = await safeFetch({
    fetch: () =>
      prisma.space.findMany({
        where: {
          isPublished: true,
          isActive: true,
          id: { not: currentId },
          ...(categoryId ? { categoryId } : {}),
        },
        select: {
          id: true,
          slug: true,
          name: true,
          capacity: true,
          hourlyPrice: true,
          mainImageUrl: true,
          imageUrls: true,
        },
        take: limit,
        orderBy: { name: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getRelatedSpaces",
  });

  return toPlainArray(
    spaces.map((s) => ({
      ...s,
      hourlyPrice: Number(s.hourlyPrice),
      imageUrls: parseStringArray(s.imageUrls),
    })),
  );
}

/**
 * 有効なスペースカテゴリ一覧を取得（フィルター UI 用）
 */
/**
 * スペースが指定ロケーションに属するか検証する（予約フォーム用）
 * キャッシュなし（ミューテーション前の整合性チェック用途）
 */
export async function verifySpaceBelongsToLocation(
  spaceId: string,
  locationId: string,
): Promise<boolean> {
  const space = await prisma.space.findUnique({
    where: { id: spaceId },
    select: { locationId: true },
  });
  return space !== null && space.locationId === locationId;
}

export async function getActiveCategories() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACE_CATEGORIES);

  const categories = await safeFetch({
    fetch: () =>
      prisma.spaceCategory.findMany({
        where: { isActive: true },
        select: { id: true, name: true, icon: true },
        orderBy: { sortOrder: "asc" },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getActiveCategories",
  });

  return toPlainArray(categories);
}

/**
 * 指定ロケーションの公開済み・有効スペース一覧（編集フォーム用）
 */
export async function getActiveSpacesByLocationId(locationId: string) {
  const spaces = await prisma.space.findMany({
    where: { locationId, isPublished: true, isActive: true },
    select: {
      id: true,
      name: true,
      capacity: true,
      hourlyPrice: true,
    },
    orderBy: { name: "asc" },
  });

  return spaces.map((s) => ({
    ...s,
    hourlyPrice: Number(s.hourlyPrice),
  }));
}
