"use server";

import { headers } from "next/headers";
import { getSession, auth } from "@/shared/lib/auth";
import { getAccountProviders } from "@/shared/domain/users/queries";
import {
  createMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { checkActionRateLimit } from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";

export async function getAccountLinksAction(): Promise<
  MutationResult<{ accounts: string[] }>
> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  const providers = await getAccountProviders(session.user.id);
  return { accounts: providers };
}

export async function deleteAccountAction(): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getSession();
  if (!session) return createMutationError("認証が必要です");

  try {
    await auth.api.deleteUser({
      headers: await headers(),
      body: {},
    });
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
