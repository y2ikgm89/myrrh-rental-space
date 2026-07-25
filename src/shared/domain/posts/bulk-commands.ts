import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

/**
 * 複数投稿の公開状態を一括切替する。
 *
 * - `publish: true` → DRAFT のみ PUBLISHED にする（ARCHIVED は触らない）
 * - `publish: false` → PUBLISHED のみ DRAFT にする（ARCHIVED / DRAFT は触らない）
 * - soft-delete 済み（deletedAt が non-null）は対象外
 */
export async function bulkTogglePublishedCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean }> {
  if (ids.length === 0) {
    return { count: 0, isPublished: publish };
  }

  const result = await prisma.post.updateMany({
    where: {
      id: { in: ids },
      deletedAt: null,
      status: publish ? PostStatus.DRAFT : PostStatus.PUBLISHED,
    },
    data: {
      status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
      publishedAt: publish ? new Date() : null,
    },
  });
  return { count: result.count, isPublished: publish };
}

/**
 * 複数投稿を一括ソフトデリートする。
 *
 * updateMany の where に `deletedAt: null` を含め、既にゴミ箱入りの行は数えない。
 */
export async function bulkDeletePostsCommand(
  ids: string[],
): Promise<{ count: number }> {
  if (ids.length === 0) {
    return { count: 0 };
  }

  const result = await prisma.post.updateMany({
    where: { id: { in: ids }, deletedAt: null },
    data: { deletedAt: new Date() },
  });
  return { count: result.count };
}
