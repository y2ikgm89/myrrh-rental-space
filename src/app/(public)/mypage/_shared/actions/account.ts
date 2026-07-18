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
import { revokeOAuthGrantForProvider } from "@/shared/lib/oauth-revoke";

export async function getAccountLinksAction(): Promise<
  MutationResult<{ accounts: string[] }>
> {
  // SETTINGS-01: read query に write-form の rate limit を掛けると Server Component の
  // 描画のたびに quota を消費し、上限到達で連携表示が silent に空配列 fallback して
  // ユーザーが自分の連携状態を見失う。cost gate は MypageAuthGate の redirect と
  // Better Auth session cookie の presence 検証で十分（未認証は SC 描画に到達しない）。
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
 * ソーシャルアカウントの連携を解除する。
 *
 * DB row の削除だけでは Google / LINE 側の OAuth grant が残り、UI 上「解除」の
 * 心証と乖離する（GDPR 第 17 条の propagation 論点）。DB row 削除の前に upstream の
 * revoke endpoint を best-effort で叩く（失敗しても unlink 自体は完了させる）。
 *
 * client の Better Auth SDK 経由（`unlinkAccount({ providerId })`）は DB row 削除
 * だけを行うため、revoke を絡めるにはこの Server Action 経由に切り替える必要がある。
 */
export async function unlinkAccountAction(
  providerId: string,
): Promise<MutationResult<null>> {
  const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
  if (!rateLimit.success) return createMutationError("リクエストが多すぎます");

  const session = await getCustomerSession();
  if (!session) return createMutationError("認証が必要です");

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

  if (providerId !== "google" && providerId !== "line") {
    return createMutationError("対応していない連携プロバイダーです");
  }

  // 1) upstream revoke: getAccessToken は Better Auth 側で復号（`encryptOAuthTokens`）
  //    + 期限切れ auto-refresh を行うため、素の access_token が得られる。失敗しても
  //    DB unlink を止めないよう try/catch で握りつぶす（logError で MEDIUM を残す）。
  try {
    const requestHeaders = await headers();
    const tokenResult = await customerAuth.api.getAccessToken({
      body: { providerId, userId: session.user.id },
      headers: requestHeaders,
    });
    const accessToken = tokenResult?.accessToken;
    if (accessToken) {
      await revokeOAuthGrantForProvider(providerId, accessToken);
    }
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: "unlinkAccount.revoke",
        providerId,
        userId: session.user.id,
      },
    });
  }

  // 2) DB unlink: Better Auth の accountLinking 保護（最低 1 連携が必要 /
  //    `allowUnlinkingAll` 未有効）を通す。失敗時は MutationError を返す。
  try {
    await customerAuth.api.unlinkAccount({
      body: { providerId },
      headers: await headers(),
    });
    return null;
  } catch (error) {
    logError(error, {
      category: ErrorCategory.EXTERNAL_API,
      severity: ErrorSeverity.HIGH,
      context: {
        operation: "unlinkAccount",
        providerId,
        userId: session.user.id,
      },
    });
    return createMutationError("連携解除に失敗しました");
  }
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
