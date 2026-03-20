import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import {
  CACHE_LIFE,
  CACHE_TAGS,
  PAGINATION_DEFAULTS,
  getCacheTag,
} from "@/shared/lib/constants";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";

const spaceListSelect = {
  id: true,
  slug: true,
  name: true,
  description: true,
  capacity: true,
  area: true,
  hourlyPrice: true,
  mainImageUrl: true,
  category: { select: { id: true, name: true } },
} as const;

/**
 * 公開済み・有効なスペース一覧を取得（カテゴリ付き）
 */
export async function getPublishedSpaces(categoryId?: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const spaces = await prisma.space.findMany({
    where: {
      isPublished: true,
      isActive: true,
      ...(categoryId ? { categoryId } : {}),
    },
    select: spaceListSelect,
    orderBy: { name: "asc" },
  });

  return toPlainArray(
    spaces.map((s) => ({
      ...s,
      hourlyPrice: Number(s.hourlyPrice),
    })),
  );
}

/**
 * 公開済み・有効なスペース一覧をページネーション付きで取得
 */
export async function getPublishedSpacesPaginated(
  page: number = 1,
  perPage: number = PAGINATION_DEFAULTS.public.default,
  categoryId?: string,
) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  const where = {
    isPublished: true,
    isActive: true,
    ...(categoryId ? { categoryId } : {}),
  };

  const skip = (page - 1) * perPage;

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
    items: toPlainArray(
      rawItems.map((s) => ({
        ...s,
        hourlyPrice: Number(s.hourlyPrice),
      })),
    ),
    totalPages: Math.ceil(totalCount / perPage),
    currentPage: page,
  };
}

/**
 * スラッグからスペース詳細を取得（公開済み・有効のみ）
 */
export async function getSpaceBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES, getCacheTag.spaces.detail(slug));

  const space = await prisma.space.findFirst({
    where: { slug, isPublished: true, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      capacity: true,
      area: true,
      hourlyPrice: true,
      dailyPrice: true,
      mainImageUrl: true,
      imageUrls: true,
      facilities: true,
      address: true,
      metaDescription: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImageUrl: true,
      category: { select: { id: true, name: true } },
      location: { select: { id: true, name: true } },
    },
  });

  if (!space) return null;

  return toPlainObject({
    ...space,
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

  const spaces = await prisma.space.findMany({
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
    },
    take: limit,
    orderBy: { name: "asc" },
  });

  return toPlainArray(
    spaces.map((s) => ({
      ...s,
      hourlyPrice: Number(s.hourlyPrice),
    })),
  );
}

/**
 * 有効なスペースカテゴリ一覧を取得（フィルター UI 用）
 */
export async function getActiveCategories() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACE_CATEGORIES);

  const categories = await prisma.spaceCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true, icon: true },
    orderBy: { sortOrder: "asc" },
  });

  return toPlainArray(categories);
}
