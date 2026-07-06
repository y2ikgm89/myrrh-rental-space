"use server";

import { headers } from "next/headers";
import { getCustomerSession, customerAuth } from "@/shared/lib/customer-auth";
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
import {
  checkActionRateLimit,
  validateTurnstile,
} from "@/shared/lib/action-helpers";
import { formSubmitRateLimiter } from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";

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

/**
 * アカウント削除の申請を受け付ける。
 *
 * 顧客は OAuth 専用（パスワード未設定）のため、即時削除は session hijack / XSS /
 * 共有端末で危険（Better Auth 公式 docs "Authentication Requirements" 参照）。
 * `customer-auth.ts` に `sendDeleteAccountVerification` を設定済みのため、この呼び出しは
 * 即時削除ではなく確認メール送信のみを行う。実際の削除は本人がメール内リンクを踏んだ
 * 時点（Better Auth 内部の `/api/customer-auth/delete-user/callback`）で発生し、
 * キャッシュ無効化もその `afterDelete` フックで行う（ここでは行わない）。
 */
export async function deleteAccountAction(
  turnstileToken?: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const turnstile = await validateTurnstile({
    token: turnstileToken,
    expectedAction: TURNSTILE_ACTIONS.mypage_account_delete,
  });
  if (!turnstile.success) return createMutationError(turnstile.error);

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

  try {
    await customerAuth.api.deleteUser({
      headers: await headers(),
      body: { callbackURL: "/" },
    });

    return null;
  } catch (error) {
    logError(error, {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.HIGH,
      context: { operation: "deleteAccount", userId: session.user.id },
    });
    return createMutationError("アカウント削除の受付に失敗しました");
  }
}
