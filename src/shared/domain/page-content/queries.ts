import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { z } from "zod/v4";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

/**
 * ページコンテンツを取得し、Zod スキーマでバリデーションする
 *
 * DB にデータがない場合やバリデーション失敗時はデフォルト値を返す
 */
export async function getPageContent<T>(
  pageKey: string,
  schema: z.ZodType<T>,
  defaultContent: T,
): Promise<T> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGE_CONTENT, getCacheTag.pageContent.detail(pageKey));

  const row = await prisma.pageContent.findUnique({
    where: { pageKey },
    select: { content: true },
  });

  if (!row) return defaultContent;

  const result = schema.safeParse(row.content);
  if (!result.success) return defaultContent;

  return result.data;
}

/**
 * ページコンテンツの SEO メタデータを取得する
 */
export async function getPageContentMeta(pageKey: string) {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGE_CONTENT, getCacheTag.pageContent.meta(pageKey));

  return prisma.pageContent.findUnique({
    where: { pageKey },
    select: {
      metaTitle: true,
      metaDescription: true,
      ogpTitle: true,
      ogpDescription: true,
      ogpImage: true,
    },
  });
}
