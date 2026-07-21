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
 * - `publish: true` で `isPublished` を true に設定。`publishedAt` は
 *   既に設定済みの記事は既存値を保持し、未設定（null）の記事のみ現在時刻を設定する
 *   （単体操作の `publishNews` と同じ `publishedAt ?? new Date()` 挙動）
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
    select: { id: true, slug: true, publishedAt: true },
  });
  if (targets.length === 0) {
    return { count: 0, isPublished: publish, affectedSlugs: [] };
  }

  let count: number;
  if (publish) {
    // publishedAt が未設定の記事のみ現在時刻を設定し、設定済みの記事は既存値を保持する
    // （行ごとに異なる値が必要なため updateMany を 2 グループに分割する）
    const unsetIds = targets
      .filter((t) => t.publishedAt === null)
      .map((t) => t.id);
    const alreadySetIds = targets
      .filter((t) => t.publishedAt !== null)
      .map((t) => t.id);

    const [unsetResult, alreadySetResult] = await Promise.all([
      unsetIds.length === 0
        ? Promise.resolve({ count: 0 })
        : prisma.news.updateMany({
            where: { id: { in: unsetIds } },
            data: { isPublished: true, publishedAt: new Date() },
          }),
      alreadySetIds.length === 0
        ? Promise.resolve({ count: 0 })
        : prisma.news.updateMany({
            where: { id: { in: alreadySetIds } },
            data: { isPublished: true },
          }),
    ]);
    count = unsetResult.count + alreadySetResult.count;
  } else {
    const result = await prisma.news.updateMany({
      where: { id: { in: targets.map((t) => t.id) } },
      data: {
        isPublished: false,
        publishedAt: null,
      },
    });
    count = result.count;
  }

  return {
    count,
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
