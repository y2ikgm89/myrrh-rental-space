"use server";

import { z } from "zod";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  toggleReviewPublishedCommand,
  deleteReviewCommand,
  replyToReviewCommand,
  deleteReviewReplyCommand,
} from "@/shared/domain/reviews/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { reviewReplySchema } from "@/shared/lib/validations/review";
import type { ReviewReplyInput } from "@/shared/lib/validations/review";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendReviewReplyEmail } from "@/shared/lib/email/review-emails";
import { ErrorCategory } from "@/shared/lib/errors/server";

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
      const result = await toggleReviewPublishedCommand(
        validated.data,
        isPublished,
      );
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

export async function replyToReview(
  input: ReviewReplyInput,
): Promise<MutationResult> {
  const parsed = reviewReplySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  let spaceId: string | null = null;

  return executeAdminMutationResult({
    resource: "review",
    action: "update",
    resourceId: parsed.data.reviewId,
    execute: async (user) => {
      const result = await replyToReviewCommand({
        reviewId: parsed.data.reviewId,
        replyBody: parsed.data.replyBody,
        adminUserId: user.id,
      });
      spaceId = result.spaceId;

      if (result.emailContext) {
        fireAndForget(
          sendReviewReplyEmail({
            reviewId: parsed.data.reviewId,
            customerEmail: result.emailContext.customerEmail,
            customerName: result.emailContext.customerName,
            spaceName: result.emailContext.spaceName,
            rating: result.emailContext.rating,
            originalTitle: result.emailContext.title,
            originalComment: result.emailContext.comment,
            replyBody: result.emailContext.replyBody,
          }),
          {
            operation: "sendReviewReplyEmail",
            category: ErrorCategory.EXTERNAL_API,
          },
        );
      }

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

export async function deleteReviewReply(id: string): Promise<MutationResult> {
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
      const result = await deleteReviewReplyCommand(validated.data);
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
