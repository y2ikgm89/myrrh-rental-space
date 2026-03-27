"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  toggleReviewPublishedCommand,
  deleteReviewCommand,
} from "@/shared/domain/reviews/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { prisma } from "@/shared/db/prisma";
import type { MutationResult } from "@/shared/lib/mutation-result";

const idSchema = z.string().uuid({ error: "レビューIDが不正です" });

export async function toggleReviewVisibility(
  id: string,
  isPublished: boolean,
): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let spaceId: string | null = null;

  return executeAdminMutationResult({
    resource: "review",
    action: "update",
    resourceId: validated.data,
    execute: async () => {
      const review = await prisma.spaceReview.findUnique({
        where: { id: validated.data },
        select: { spaceId: true },
      });
      spaceId = review?.spaceId ?? null;
      await toggleReviewPublishedCommand(validated.data, isPublished);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.REVIEWS);
      if (spaceId) {
        updateTag(getCacheTag.reviews.space(spaceId));
        updateTag(getCacheTag.reviews.stats(spaceId));
      }
    },
  });
}

export async function deleteReview(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  let spaceId: string | null = null;

  return executeAdminMutationResult({
    resource: "review",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      const result = await deleteReviewCommand(validated.data);
      spaceId = result.spaceId;
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.REVIEWS);
      if (spaceId) {
        updateTag(getCacheTag.reviews.space(spaceId));
        updateTag(getCacheTag.reviews.stats(spaceId));
      }
    },
  });
}
