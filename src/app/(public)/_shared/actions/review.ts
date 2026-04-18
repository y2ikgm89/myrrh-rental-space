"use server";

import { spaceReviewSchema } from "@/shared/lib/validations/review";
import {
  checkActionRateLimit,
  createValidationMutationError,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import { createReviewCommand } from "@/shared/domain/reviews/commands";
import { invalidateReviewCaches } from "@/shared/lib/cache/review-cache";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { fireAndForget } from "@/shared/lib/async-utils";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ErrorCategory } from "@/shared/lib/errors/server";

export async function submitReview(
  input: unknown,
): Promise<MutationResult<{ id: string }>> {
  // 1. Rate limit check
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError(rateLimit.error);

  // 2. Validate input
  const parsed = spaceReviewSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // 2.5. Turnstile verification
  const turnstile = await validateTurnstile({
    token: parsed.data.turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.review,
  });
  if (!turnstile.success) {
    return createMutationError(turnstile.error);
  }

  // 3. Auth - must be logged in customer
  const session = await getCustomerSession();
  if (!session) return createMutationError("ログインが必要です");

  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");

  // 4. Create review (command validates reservation ownership + derives spaceId)
  try {
    const result = await createReviewCommand({
      customerId: customer.id,
      reservationId: parsed.data.reservationId,
      rating: parsed.data.rating,
      title: parsed.data.title ?? null,
      comment: parsed.data.comment ?? null,
    });

    // 5. Cache invalidation
    invalidateReviewCaches(result.spaceId, result.spaceSlug, {
      customerId: customer.id,
      notifications: true,
    });

    // 6. Create admin notification (fire-and-forget)
    fireAndForget(
      createNotificationCommand({
        type: NOTIFICATION_TYPE.REVIEW_NEW,
        title: NOTIFICATION_TYPE_LABELS[NOTIFICATION_TYPE.REVIEW_NEW],
        message: `${customer.lastName}${customer.firstName}様からレビューが投稿されました`,
        resourceType: "review",
        resourceId: result.id,
      }),
      {
        operation: "createReviewNotification",
        category: ErrorCategory.DATABASE,
      },
    );

    return { id: result.id };
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }
}
