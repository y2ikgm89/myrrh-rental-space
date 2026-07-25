import "server-only";

import { prisma } from "@/shared/db/prisma";
import { PostStatus } from "@generated/prisma/enums";

export async function incrementPostViewCount(
  id: string,
): Promise<{ incremented: boolean }> {
  const result = await prisma.post.updateMany({
    where: { id, status: PostStatus.PUBLISHED },
    data: { viewCount: { increment: 1 } },
  });
  return { incremented: result.count > 0 };
}
