"use server";

import { headers } from "next/headers";
import { getCustomerSession, customerAuth } from "@/shared/lib/customer-auth";
import { getAccountProviders } from "@/shared/domain/users/queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { DomainError } from "@/shared/domain/domain-error";
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

  // OAUTH-BETTER-AUTH-01: Customer.isActive / status BLACKLIST を Server Action
  // 側でも強制する（MypageAuthGate は SC 描画層のみカバー）。
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");
  try {
    await assertCustomerActive(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }

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

  // OAUTH-BETTER-AUTH-01: 停止/BLACKLIST 顧客からの削除試行を Server Action 側で
  // 拒否する（管理側の review 前に自削除で証跡消失するのを防ぐ）。
  const customer = await getCustomerByUserId(session.user.id);
  if (!customer) return createMutationError("顧客情報が見つかりません");
  try {
    await assertCustomerActive(customer.id);
  } catch (error) {
    if (error instanceof DomainError) {
      return createMutationError(error.message);
    }
    throw error;
  }

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
