"use server";

import type { SubmissionResult } from "@conform-to/react";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  updateReviewPublishedCommand,
  deleteReviewCommand,
  replyToReviewCommand,
  deleteReviewReplyCommand,
} from "@/shared/domain/reviews/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { invalidateReviewCaches } from "@/shared/lib/cache/review-cache";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { reviewReplySchema } from "@/shared/lib/validations/review";
import { fireAndForget } from "@/shared/lib/async-utils";
import { sendReviewReplyEmail } from "@/shared/lib/email/review-emails";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { uuidIdSchema } from "@/shared/lib/validations/params";

const idSchema = uuidIdSchema("レビュー");

type ReviewTarget = { spaceId: string; spaceSlug: string };

export async function updateReviewPublished(
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
      updateReviewPublishedCommand(validated.data, isPublished),
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

/**
 * レビュー返信 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function replyToReview(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, reviewReplySchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "review",
      action: "update",
      resourceId: data.reviewId,
      execute: async (user) => {
        const replyResult = await replyToReviewCommand({
          reviewId: data.reviewId,
          replyBody: data.replyBody,
          adminUserId: user.id,
        });

        if (replyResult.emailContext) {
          fireAndForget(
            sendReviewReplyEmail({
              reviewId: data.reviewId,
              customerEmail: replyResult.emailContext.customerEmail,
              customerName: replyResult.emailContext.customerName,
              spaceName: replyResult.emailContext.spaceName,
              rating: replyResult.emailContext.rating,
              originalTitle: replyResult.emailContext.title,
              originalComment: replyResult.emailContext.comment,
              replyBody: replyResult.emailContext.replyBody,
              reservationId: replyResult.emailContext.reservationId,
              customerUserId: replyResult.emailContext.customerUserId,
            }),
            {
              operation: "sendReviewReplyEmail",
              category: ErrorCategory.EXTERNAL_API,
            },
          );
        }

        return {
          spaceId: replyResult.spaceId,
          spaceSlug: replyResult.spaceSlug,
        };
      },
      afterSuccess: (target) => {
        invalidateReviewCaches(target.spaceId, target.spaceSlug);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
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
