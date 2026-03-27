import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { z } from "zod";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

/**
 * DB からページコンテンツの生データを取得（キャッシュ済み）
 *
 * 'use cache' の引数は React シリアライゼーションを通るため、
 * Zod スキーマ等のシリアライズ不可オブジェクトは渡せない。
 * DB フェッチのみをキャッシュし、バリデーションは呼び出し側で行う。
 */
async function getPageContentRaw(pageKey: string): Promise<unknown> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGE_CONTENT, getCacheTag.pageContent.detail(pageKey));

  const row = await prisma.pageContent.findUnique({
    where: { pageKey },
    select: { content: true },
  });

  return row?.content ?? null;
}

/**
 * ページコンテンツを取得し、Zod スキーマでバリデーションする
 *
 * DB にデータがない場合やバリデーション失敗時はデフォルト値を返す。
 * Zod バリデーションは 'use cache' 境界の外で実行される。
 */
export async function getPageContent<T>(
  pageKey: string,
  schema: z.ZodType<T>,
  defaultContent: T,
): Promise<T> {
  const raw = await getPageContentRaw(pageKey);
  if (raw === null) return defaultContent;

  const result = schema.safeParse(raw);
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
