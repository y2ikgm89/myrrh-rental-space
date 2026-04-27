import "server-only";

import { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";

export type BulkPublishResult = {
  count: number;
  isPublished: boolean;
  affectedIds: string[];
  affectedSlugs: string[];
};

export type BulkDeleteResult = {
  count: number;
  skipped: number;
  affectedIds: string[];
  affectedSlugs: string[];
};

/**
 * 複数スペースの公開状態を一括切替する。
 *
 * - `publish: true` で `isPublished` を true + `publishedAt` を現在時刻に設定
 * - `publish: false` で `isPublished` を false + `publishedAt` を null にリセット
 * - 戻り値の `affectedIds` / `affectedSlugs` は cache invalidation 用
 */
export async function bulkTogglePublishedSpacesCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishResult> {
  if (ids.length === 0) {
    return {
      count: 0,
      isPublished: publish,
      affectedIds: [],
      affectedSlugs: [],
    };
  }
  const targets = await prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return {
      count: 0,
      isPublished: publish,
      affectedIds: [],
      affectedSlugs: [],
    };
  }
  const result = await prisma.space.updateMany({
    where: { id: { in: targets.map((t) => t.id) } },
    data: {
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
    },
  });
  return {
    count: result.count,
    isPublished: publish,
    affectedIds: targets.map((t) => t.id),
    affectedSlugs: targets.map((t) => t.slug),
  };
}

/**
 * 複数スペースを一括削除する。
 *
 * - `Reservation.spaceId` の FK 制約 (P2003) は個別 catch して `skipped` に計上
 * - 一括 `deleteMany` ではなく逐次 delete することで FK 違反のスペースのみスキップできる
 * - 戻り値の `affectedIds` / `affectedSlugs` は cache invalidation 用（削除成功分のみ）
 */
export async function bulkDeleteSpacesCommand(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) {
    return { count: 0, skipped: 0, affectedIds: [], affectedSlugs: [] };
  }
  const targets = await prisma.space.findMany({
    where: { id: { in: ids } },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, skipped: 0, affectedIds: [], affectedSlugs: [] };
  }

  let count = 0;
  let skipped = 0;
  const affectedIds: string[] = [];
  const affectedSlugs: string[] = [];

  for (const target of targets) {
    try {
      await prisma.space.delete({ where: { id: target.id } });
      count += 1;
      affectedIds.push(target.id);
      affectedSlugs.push(target.slug);
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === "P2003"
      ) {
        skipped += 1;
        continue;
      }
      throw error;
    }
  }

  return { count, skipped, affectedIds, affectedSlugs };
}
