import "server-only";

import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";

export async function bulkTogglePublishedCommand(
  ids: string[],
  publish: boolean,
): Promise<{ count: number; isPublished: boolean }> {
  const result = await prisma.post.updateMany({
    where: { id: { in: ids } },
    data: {
      status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
      publishedAt: publish ? new Date() : null,
    },
  });
  return { count: result.count, isPublished: publish };
}

export async function bulkDeletePostsCommand(
  ids: string[],
): Promise<{ count: number }> {
  const result = await prisma.post.deleteMany({
    where: { id: { in: ids } },
  });
  return { count: result.count };
}
