"use server";

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  toggleReviewPublishedCommand,
  deleteReviewCommand,
  replyToReviewCommand,
  deleteReviewReplyCommand,
} from "@/shared/domain/reviews/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateReviewCaches } from "@/shared/lib/cache/review-cache";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { reviewReplySchema } from "@/shared/lib/validations/review";
import type { ReviewReplyInput } from "@/shared/lib/validations/review";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendReviewReplyEmail } from "@/shared/lib/email/review-emails";
import { ErrorCategory } from "@/shared/lib/errors/server";

const idSchema = z.string().uuid({ error: "レビューIDが不正です" });

type ReviewTarget = { spaceId: string; spaceSlug: string };

export async function toggleReviewVisibility(
  id: string,
  isPublished: boolean,
): Promise<MutationResult<ReviewTarget>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "review",
    action: "update",
    resourceId: validated.data,
    execute: async () =>
      toggleReviewPublishedCommand(validated.data, isPublished),
    afterSuccess: (target) => {
      invalidateReviewCaches(target.spaceId, target.spaceSlug);
    },
  });
}

export async function deleteReview(
  id: string,
): Promise<MutationResult<ReviewTarget>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "review",
    action: "delete",
    resourceId: validated.data,
    execute: async () => deleteReviewCommand(validated.data),
    afterSuccess: (target) => {
      invalidateReviewCaches(target.spaceId, target.spaceSlug);
    },
  });
}

export async function replyToReview(
  input: ReviewReplyInput,
): Promise<MutationResult<ReviewTarget>> {
  const parsed = reviewReplySchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

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

      return { spaceId: result.spaceId, spaceSlug: result.spaceSlug };
    },
    afterSuccess: (target) => {
      invalidateReviewCaches(target.spaceId, target.spaceSlug);
    },
  });
}

export async function deleteReviewReply(
  id: string,
): Promise<MutationResult<ReviewTarget>> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "review",
    action: "update",
    resourceId: validated.data,
    execute: async () => deleteReviewReplyCommand(validated.data),
    afterSuccess: (target) => {
      invalidateReviewCaches(target.spaceId, target.spaceSlug);
    },
  });
}
