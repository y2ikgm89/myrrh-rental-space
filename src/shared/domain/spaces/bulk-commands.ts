import "server-only";

import { prisma } from "@/shared/db/prisma";

export interface AffectedSpace {
  id: string;
  slug: string;
}

export type BulkPublishResult = {
  count: number;
  isPublished: boolean;
  affected: ReadonlyArray<AffectedSpace>;
};

export type BulkDeleteResult = {
  count: number;
  affected: ReadonlyArray<AffectedSpace>;
};

/**
 * 複数スペースの公開状態を一括切替する。
 *
 * - `publish: true` で `isPublished` を true + `publishedAt` を現在時刻に設定
 * - `publish: false` で `isPublished` を false + `publishedAt` を null にリセット
 * - 戻り値の `affected` は cache invalidation 用（id+slug を1つのレコードで返却）
 */
export async function bulkTogglePublishedSpacesCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkPublishResult> {
  if (ids.length === 0) {
    return { count: 0, isPublished: publish, affected: [] };
  }
  const targets = await prisma.space.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, isPublished: publish, affected: [] };
  }
  const result = await prisma.space.updateMany({
    where: { id: { in: targets.map((t) => t.id) }, isActive: true },
    data: {
      isPublished: publish,
      publishedAt: publish ? new Date() : null,
    },
  });
  return {
    count: result.count,
    isPublished: publish,
    affected: targets.map((t) => ({ id: t.id, slug: t.slug })),
  };
}

/**
 * 複数スペースを一括削除（論理削除）する。
 *
 * 単体削除と同じく `isActive=false` + `isPublished=false` に統一する。
 * 戻り値の `affected` は cache invalidation 用（対象 id+slug）として返す。
 */
export async function bulkDeleteSpacesCommand(
  ids: string[],
): Promise<BulkDeleteResult> {
  if (ids.length === 0) {
    return { count: 0, affected: [] };
  }
  const targets = await prisma.space.findMany({
    where: { id: { in: ids }, isActive: true },
    select: { id: true, slug: true },
  });
  if (targets.length === 0) {
    return { count: 0, affected: [] };
  }

  const result = await prisma.space.updateMany({
    where: { id: { in: targets.map((t) => t.id) }, isActive: true },
    data: {
      isActive: false,
      isPublished: false,
      publishedAt: null,
    },
  });

  return { count: result.count, affected: targets };
}
