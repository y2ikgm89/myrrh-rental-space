"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { PostStatus } from "@generated/prisma/enums";
import { prisma } from "@/shared/db/prisma";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  invalidatePostCollectionCaches,
  purgePostArchive,
} from "./cache-helpers";

const bulkIdsSchema = z
  .array(z.string().uuid({ error: "投稿IDが不正です" }))
  .min(1, { error: "1件以上選択してください" });

export async function bulkTogglePostPublished(
  ids: string[],
  publish: boolean,
): Promise<MutationResult<{ count: number; isPublished: boolean }>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "publish",
    execute: async () => {
      const result = await prisma.post.updateMany({
        where: { id: { in: parsed.data } },
        data: {
          status: publish ? PostStatus.PUBLISHED : PostStatus.DRAFT,
          publishedAt: publish ? new Date() : null,
        },
      });
      return { count: result.count, isPublished: publish };
    },
    afterSuccess: async () => {
      await invalidatePostCollectionCaches();
      await purgePostArchive();
    },
  });
}

export async function bulkDeletePosts(
  ids: string[],
): Promise<MutationResult<{ count: number }>> {
  const parsed = bulkIdsSchema.safeParse(ids);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "post",
    action: "delete",
    execute: async () => {
      const result = await prisma.post.deleteMany({
        where: { id: { in: parsed.data } },
      });
      return { count: result.count };
    },
    afterSuccess: async () => {
      await invalidatePostCollectionCaches();
      await purgePostArchive();
    },
  });
}
