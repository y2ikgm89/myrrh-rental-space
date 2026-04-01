"use server";

import { getSession } from "@/shared/lib/auth";
import { updateCustomerProfileByUserId } from "@/shared/domain/customers/commands";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  createValidationMutationError,
  checkActionRateLimit,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  customerProfileSchema,
  type CustomerProfileInput,
} from "@/shared/lib/validations/customer-profile";

export async function updateProfileAction(
  input: CustomerProfileInput,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const parsed = customerProfileSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  try {
    await updateCustomerProfileByUserId(session.user.id, {
      lastName: parsed.data.lastName,
      firstName: parsed.data.firstName,
      phoneNumber: parsed.data.phoneNumber || null,
    });

    updateTag(CACHE_TAGS.CUSTOMERS);

    return null;
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "updateProfile", userId: session.user.id },
    });
    return createMutationError("プロフィールの更新に失敗しました");
  }
}
