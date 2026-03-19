import "server-only";

import { prisma, Prisma } from "@/shared/db/prisma";

export type UpdatePageContentInput = {
  pageKey: string;
  content: Prisma.InputJsonValue;
  metaTitle?: string | null;
  metaDescription?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  ogpImage?: string | null;
  updatedBy?: string | null;
};

/**
 * ページコンテンツを更新する（upsert）
 *
 * キャッシュ無効化は呼び出し元の Server Action 層で行う:
 * ```typescript
 * updateTag(CACHE_TAGS.PAGE_CONTENT);
 * updateTag(getCacheTag.pageContent.detail(pageKey));
 * ```
 */
export async function updatePageContentCommand(
  input: UpdatePageContentInput,
): Promise<{ id: string; pageKey: string }> {
  const {
    pageKey,
    content,
    metaTitle,
    metaDescription,
    ogpTitle,
    ogpDescription,
    ogpImage,
    updatedBy,
  } = input;

  const updated = await prisma.pageContent.upsert({
    where: { pageKey },
    create: {
      pageKey,
      content,
      metaTitle: metaTitle ?? null,
      metaDescription: metaDescription ?? null,
      ogpTitle: ogpTitle ?? null,
      ogpDescription: ogpDescription ?? null,
      ogpImage: ogpImage ?? null,
      updatedBy: updatedBy ?? null,
    },
    update: {
      content,
      metaTitle: metaTitle ?? null,
      metaDescription: metaDescription ?? null,
      ogpTitle: ogpTitle ?? null,
      ogpDescription: ogpDescription ?? null,
      ogpImage: ogpImage ?? null,
      updatedBy: updatedBy ?? null,
    },
    select: { id: true, pageKey: true },
  });

  return updated;
}
