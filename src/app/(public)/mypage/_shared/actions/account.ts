"use server";

import { headers } from "next/headers";
import { updateTag } from "next/cache";
import { getCustomerSession, customerAuth } from "@/shared/lib/customer-auth";
import { getAccountProviders } from "@/shared/domain/users/queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";

export async function getAccountLinksAction(): Promise<
  MutationResult<{ accounts: string[] }>
> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const providers = await getAccountProviders(session.user.id);
  return { accounts: providers };
}

export async function deleteAccountAction(
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile(turnstileToken);
  if (!turnstile.success) return createMutationError(turnstile.error);

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  const customer = await getCustomerByUserId(session.user.id);

  try {
    await customerAuth.api.deleteUser({
      headers: await headers(),
      body: {},
    });

    updateTag(CACHE_TAGS.CUSTOMERS);
    updateTag(CACHE_TAGS.RESERVATIONS);
    updateTag(CACHE_TAGS.REVIEWS);
    updateTag(CACHE_TAGS.INQUIRIES);
    updateTag(CACHE_TAGS.EVENTS);
    if (customer) {
      updateTag(getCacheTag.customers.detail(customer.id));
    }

    return null;
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "deleteAccount", userId: session.user.id },
    });
    return createMutationError("アカウントの削除に失敗しました");
  }
}
