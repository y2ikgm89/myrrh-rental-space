import "server-only";

import { prisma } from "@/shared/db/prisma";

export type BulkPublishNewsResult = {
  count: number;
  isPublished: boolean;
  affectedSlugs: string[];
};

export type BulkDeleteNewsResult = {
  count: number;
  affectedSlugs: string[];
};

/**
 * 複数のお知らせの公開状態を一括切替する。
 *
 * - `publish: true` で `isPublished` を true + `publishedAt` を現在時刻に設定
 * - `publish: false` で `isPublished` を false + `publishedAt` を null にリセット
 * - 戻り値の `affectedSlugs` は cache invalidation 用
 */
export async function bulkTogglePublishedNewsCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishNewsResult> {
  if (ids.length === 0) {
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  }
  const targets = await prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  }
  const result = await prisma.news.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
    },
  });
  return {
    count: result.count,
    isPublished: publish,
    affectedSlugs: targets.map((t) => t.slug),
  };
}

/**
 * 複数のお知らせを一括削除する。
 *
 * - お知らせは外部 FK 依存がないため `deleteMany` で一括削除可
 * - 戻り値の `affectedSlugs` は cache invalidation 用
 */
export async function bulkDeleteNewsCommand(
  ids: string[],
): Promise<BulkDeleteNewsResult> {
  if (ids.length === 0) {
    return { count: 0, affectedSlugs: [] };
  }
  const targets = await prisma.news.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, affectedSlugs: [] };
  }
  const result = await prisma.news.deleteMany({
    where: { id: { in: targets.map((t) => t.id) } },
  });
  return {
    count: result.count,
    affectedSlugs: targets.map((t) => t.slug),
  };
}
