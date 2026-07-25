import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

export type BulkTogglePublishedPostsResult = {
  count: number;
  isPublished: boolean;
  affectedIds: string[];
};

export type BulkDeletePostsResult = {
  count: number;
  affectedIds: string[];
};

/**
 * 複数投稿の公開状態を一括切替する。
 *
 * - `publish: true` → DRAFT のみ PUBLISHED にする（ARCHIVED は触らない）
 * - `publish: false` → PUBLISHED のみ DRAFT にする（ARCHIVED / DRAFT は触らない）
 * - 戻り値の `affectedIds` は実際に状態遷移した行のみ（per-id audit 用）
 */
export async function bulkTogglePublishedCommand(
  ids: string[],
  publish: boolean,
): Promise<BulkTogglePublishedPostsResult> {
  if (ids.length === 0) {
    return { count: 0, isPublished: publish, affectedIds: [] };
  }

  const eligibleStatus = publish ? PostStatus.DRAFT : PostStatus.PUBLISHED;
  const targets = await prisma.post.findMany({
    where: {
      id: { in: ids },
      status: eligibleStatus,
    },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, isPublished: publish, affectedIds: [] };
  }

  const affectedIds = targets.map((t) => t.id);
  const result = await prisma.post.updateMany({
    where: {
      id: { in: affectedIds },
      status: eligibleStatus,
    },
    data: {
      status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
      publishedAt: publish ? new Date() : null,
    },
  });

  return {
    count: result.count,
    isPublished: publish,
    affectedIds,
  };
}

export async function bulkDeletePostsCommand(
  ids: string[],
): Promise<BulkDeletePostsResult> {
  if (ids.length === 0) {
    return { count: 0, affectedIds: [] };
  }

  const targets = await prisma.post.findMany({
    where: { id: { in: ids } },
    select: { id: true },
  });
  if (targets.length === 0) {
    return { count: 0, affectedIds: [] };
  }

  const affectedIds = targets.map((t) => t.id);
  const result = await prisma.post.deleteMany({
    where: { id: { in: affectedIds } },
  });

  return { count: result.count, affectedIds };
}
