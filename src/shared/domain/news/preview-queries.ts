import "server-only";

import { prisma } from "@/shared/db/prisma";
import { toPlainObject } from "@/shared/lib/serialize";
import type { Prisma } from "@generated/prisma/client";

const newsDetailSelect = {
  id: true,
  slug: true,
  title: true,
  contentHtml: true,
  publishedAt: true,
  contentWidth: true,
  contentWidthCustom: true,
  metaDescription: true,
  metaKeywords: true,
  ogpTitle: true,
  ogpDescription: true,
  ogpImageUrl: true,
} as const satisfies Prisma.NewsSelect;

/**
 * Preview 用 news fetch — published filter なし (draft 含む全件)、cache なし (常に最新)。
 *
 * 公開 `getPublishedNewsItem(slug)` と同じ select shape + `url` 付加で
 * 本番 `NewsDetailPageContent` をそのまま再利用可能にする canonical 整形。
 */
export async function getNewsByIdForPreview(id: string) {
  const item = await prisma.news.findUnique({
    where: { id },
    select: newsDetailSelect,
  });

  if (!item) return null;

  return toPlainObject({
    ...item,
    url: `/news/${item.slug}`,
  });
}
