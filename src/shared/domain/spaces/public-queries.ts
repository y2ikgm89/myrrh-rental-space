import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

/**
 * 公開済み・有効なスペース一覧を取得（カテゴリ付き）
 */
export async function getPublishedSpaces() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES);

  return prisma.space.findMany({
    where: { isPublished: true, isActive: true },
    select: {
      id: true,
      slug: true,
      name: true,
      description: true,
      capacity: true,
      area: true,
      hourlyPrice: true,
      mainImageUrl: true,
      category: { select: { id: true, name: true } },
    },
    orderBy: { name: "asc" },
  });
}

/**
 * スラッグからスペース詳細を取得（公開済み・有効のみ）
 */
export async function getSpaceBySlug(slug: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACES, getCacheTag.spaces.detail(slug));

  return prisma.space.findFirst({
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

  return prisma.space.findMany({
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
}

/**
 * 有効なスペースカテゴリ一覧を取得（フィルター UI 用）
 */
export async function getActiveCategories() {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.SPACE_CATEGORIES);

  return prisma.spaceCategory.findMany({
    where: { isActive: true },
    select: { id: true, name: true, icon: true },
    orderBy: { sortOrder: "asc" },
  });
}
