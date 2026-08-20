"use server";

import { headers } from "next/headers";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { getCustomerSession, customerAuth } from "@/shared/lib/customer-auth";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { getAccountProviders } from "@/shared/domain/users/queries";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
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
 * client の Better Auth SDK 経由（`unlinkAccount({ accountId })`）は DB row 削除
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

  // Better Auth 1.7: account セレクタは local Account.id。listUserAccounts の
  // accountId は provider-side sub なので、渡すのは必ず account.id。
  const requestHeaders = await headers();
  const accounts = await customerAuth.api.listUserAccounts({
    headers: requestHeaders,
  });
  const account = accounts.find((linked) => linked.providerId === providerId);
  if (!account) return createMutationError("連携が見つかりません");

  // 1) upstream revoke: getAccessToken は Better Auth 側で復号（`encryptOAuthTokens`）
  //    + 期限切れ auto-refresh を行うため、素の access_token が得られる。失敗しても
  //    DB unlink を止めないよう try/catch で握りつぶす（logError で MEDIUM を残す）。
  try {
    const tokenResult = await customerAuth.api.getAccessToken({
      body: { accountId: account.id, userId: session.user.id },
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
      body: { accountId: account.id },
      headers: requestHeaders,
    });

    // SEC-MYPAGE-02 系: OAuth 連携解除は資格情報の状態変更にあたるため、
    // deleteAccountAction と対称に customer-mypage 経路の証跡を残す。
    // fire-and-forget で書込失敗は連携解除自体を巻き戻さない。
    fireAndForget(
      (async () => {
        const request = await buildAuditRequestContext();
        await createAuditLogRecord({
          userId: session.user.id,
          action: AuditAction.UPDATE,
          resource: "customer",
          resourceId: customer.id,
          metadata: {
            channel: "customer-mypage",
            operation: "customer_oauth_account_unlinked",
            providerId,
            ip: request.ip,
            userAgent: request.userAgent,
          },
        });
      })(),
      {
        operation: "auditCustomerAccountUnlink",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
      },
    );

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

    // SEC-MYPAGE-02: 実削除は本人が確認メールリンクを踏んだ時点
    // (Better Auth 内 delete-user callback) に発生するが、この Action が
    // 呼ばれた時点で「顧客が自らアカウント削除を申請した」意思が確定するため、
    // customer-mypage 経路の証跡として AuditLog を残す。実削除の side-effect
    // (afterDelete で site-wide cache invalidation) は customer-auth.ts 側で
    // 実施済み。fire-and-forget で書込失敗は削除申請自体を巻き戻さない。
    // buildAuditRequestContext も含めて IIFE 全体を wrap することで context 取得
    // 側の失敗も fireAndForget の logError に集約する。
    fireAndForget(
      (async () => {
        const request = await buildAuditRequestContext();
        await createAuditLogRecord({
          userId: session.user.id,
          action: AuditAction.DELETE,
          resource: "customer",
          resourceId: customer.id,
          metadata: {
            channel: "customer-mypage",
            operation: "customer_account_delete_requested",
            ip: request.ip,
            userAgent: request.userAgent,
          },
        });
      })(),
      {
        operation: "auditCustomerAccountDeleteRequest",
        category: ErrorCategory.DATABASE,
        severity: ErrorSeverity.MEDIUM,
      },
    );

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
