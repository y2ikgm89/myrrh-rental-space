"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { updateCustomerProfileByUserId } from "@/shared/domain/customers/commands";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { customerProfileSchema } from "@/shared/lib/validations/customer-profile";

export async function updateProfileAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    customerProfileSchema,
    async (data) => {
      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: "リクエストが多すぎます" };
      }

      const session = await getCustomerSession();
      if (!session) {
        return { ok: false, error: "認証が必要です" };
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.mypage_profile,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      try {
        await updateCustomerProfileByUserId(session.user.id, {
          customerType: data.customerType,
          lastName: data.lastName,
          firstName: data.firstName,
          companyName: data.companyName || null,
          phoneNumber: data.phoneNumber || null,
        });

        const customer = await getCustomerByUserId(session.user.id);
        updateTag(CACHE_TAGS.CUSTOMERS);
        if (customer) {
          updateTag(getCacheTag.customers.detail(customer.id));
        }

        return { ok: true };
      } catch (error) {
        logError(error, {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.HIGH,
          context: { operation: "updateProfile", userId: session.user.id },
        });
        return { ok: false, error: "プロフィールの更新に失敗しました" };
      }
    },
    { resetForm: false },
  );
}
