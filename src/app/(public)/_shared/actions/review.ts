"use server";

import type { SubmissionResult } from "@conform-to/react";
import { spaceReviewSchema } from "@/shared/lib/validations/review";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { createReviewCommand } from "@/shared/domain/reviews/commands";
import { invalidateReviewCaches } from "@/shared/lib/cache/review-cache";
import { DomainError } from "@/shared/domain/domain-error";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { assertLoginSignupReagreed } from "@/shared/lib/terms-consent-gate";
import { fireAndForget } from "@/shared/lib/async-utils";
import { createNotificationCommand } from "@/shared/domain/notifications/commands";
import {
  NOTIFICATION_TYPE,
  NOTIFICATION_TYPE_LABELS,
} from "@/shared/lib/validations/enums/helpers";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { checkPublicSiteWritable } from "@/shared/lib/maintenance-guard";

export async function submitReview(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, spaceReviewSchema, async (data) => {
    const maintenance = await checkPublicSiteWritable();
    if (!maintenance.ok) {
      return { ok: false, error: maintenance.error };
    }

    const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
    if (!rateLimit.success) {
      return { ok: false, error: rateLimit.error };
    }

    const turnstile = await validateTurnstile({
      token: data.turnstileToken,
      expectedAction: TURNSTILE_ACTIONS.review,
    });
    if (!turnstile.success) {
      return { ok: false, error: turnstile.error };
    }

    const session = await getCustomerSession();
    if (!session) {
      return { ok: false, error: "ログインが必要です" };
    }

    const customer = await getCustomerByUserId(session.user.id);
    if (!customer) {
      return { ok: false, error: "顧客情報が見つかりません" };
    }

    try {
      await assertCustomerActive(customer.id);
      await assertLoginSignupReagreed(customer.id);
      const result = await createReviewCommand({
        customerId: customer.id,
        reservationId: data.reservationId,
        rating: data.rating,
        title: data.title ?? null,
        comment: data.comment ?? null,
      });

      invalidateReviewCaches(result.spaceId, result.spaceSlug, {
        customerId: customer.id,
      });

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

      return { ok: true };
    } catch (error) {
      if (error instanceof DomainError) {
        return { ok: false, error: error.message };
      }
      throw error;
    }
  });
}
