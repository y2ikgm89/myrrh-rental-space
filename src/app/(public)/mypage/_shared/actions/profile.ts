"use server";

import type { SubmissionResult } from "@conform-to/react";
import { updateTag } from "next/cache";
import { AuditAction } from "@/shared/lib/validations/enums/prisma-types";
import { getCustomerSession } from "@/shared/lib/customer-auth";
import { validateTurnstile } from "@/shared/domain/settings/turnstile";
import { requestCustomerEmailChangeCommand } from "@/shared/domain/customers/customer-email-change-commands";
import { updateCustomerProfileByUserId } from "@/shared/domain/customers/commands";
import { getCustomerByUserId } from "@/shared/domain/customers/queries";
import { assertCustomerActive } from "@/shared/domain/customers/guard";
import { DomainError } from "@/shared/domain/domain-error";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CACHE_TAGS, getAppUrl, getCacheTag } from "@/shared/lib/constants";
import {
  checkActionRateLimit,
  checkEmailRateLimit,
} from "@/shared/lib/action-helpers";
import {
  emailVerificationByEmailRateLimiter,
  emailVerificationRequestRateLimiter,
  formSubmitRateLimiter,
} from "@/shared/lib/rate-limit";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { customerProfileSchema } from "@/shared/lib/validations/customer-profile";
import { sendChangeEmailVerificationEmail } from "@/shared/domain/email/lib-dispatch";
import { checkPublicSiteWritable } from "@/shared/domain/settings/maintenance-guard";

const EMAIL_VERIFICATION_SENT_MESSAGE =
  "確認メールを送信しました。メールに記載された URL をクリックして登録を完了してください。";

export async function updateProfileAction(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    customerProfileSchema,
    async (data) => {
      // メンテナンス中は公開側の書込を止める（監査 A-48）。rate limit より前。
      const writable = await checkPublicSiteWritable();
      if (!writable.ok) return { ok: false, error: writable.error };

      const rateLimit = await checkActionRateLimit(formSubmitRateLimiter);
      if (!rateLimit.success) {
        return { ok: false, error: "リクエストが多すぎます" };
      }

      const session = await getCustomerSession();
      if (!session) {
        return { ok: false, error: "認証が必要です" };
      }

      // OAUTH-BETTER-AUTH-01: Customer.isActive / status BLACKLIST を Server Action
      // 側でも強制する（MypageAuthGate は SC 描画層のみカバー）。
      // updateCustomerProfileByUserId は userId 起点のため、事前に customer.id へ
      // 解決してから active gate を通す。
      const preCustomer = await getCustomerByUserId(session.user.id);
      if (!preCustomer) {
        return { ok: false, error: "顧客情報が見つかりません" };
      }
      try {
        await assertCustomerActive(preCustomer.id);
      } catch (error) {
        if (error instanceof DomainError) {
          return { ok: false, error: error.message };
        }
        throw error;
      }

      const turnstile = await validateTurnstile({
        token: data.turnstileToken,
        expectedAction: TURNSTILE_ACTIONS.mypage_profile,
      });
      if (!turnstile.success) {
        return { ok: false, error: turnstile.error };
      }

      const emailInput =
        typeof data.email === "string" && data.email.length > 0
          ? data.email
          : null;

      try {
        await updateCustomerProfileByUserId(session.user.id, {
          customerType: data.customerType,
          lastName: data.lastName,
          firstName: data.firstName,
          companyName: data.companyName || null,
          phoneNumber: data.phoneNumber || null,
          marketingOptIn: data.marketingOptIn,
        });

        const customer = await getCustomerByUserId(session.user.id);
        updateTag(CACHE_TAGS.CUSTOMERS);
        if (customer) {
          updateTag(getCacheTag.customers.detail(customer.id));
        }

        // SEC-MYPAGE-02: 顧客本人のプロフィール変更は admin の
        // updateCustomer 経路と対称に AuditLog へ残す。self-service 経路である
        // ことは metadata.channel で判別可能にする (`customer-mypage`)。
        // 送信は fire-and-forget: append-only の証跡目的で、書込失敗が profile
        // 更新自体を巻き戻さない。buildAuditRequestContext も含めて IIFE 全体を
        // wrap することで context 取得側の失敗も fireAndForget の logError に集約
        // する (テスト時に next/headers・rate-limit のスタブが不完全でも成功パスを
        // 壊さない防波堤も兼ねる)。SETTINGS-02 の verification 早期 return より
        // 前に発火することで、profile 更新の事実は verification 成否に依らず記録される。
        fireAndForget(
          (async () => {
            const request = await buildAuditRequestContext();
            await createAuditLogRecord({
              userId: session.user.id,
              action: AuditAction.UPDATE,
              resource: "customer",
              ...(preCustomer.id ? { resourceId: preCustomer.id } : {}),
              newValue: {
                customerType: data.customerType,
                lastName: data.lastName,
                firstName: data.firstName,
                companyName: data.companyName || null,
                phoneNumber: data.phoneNumber || null,
                marketingOptIn: data.marketingOptIn,
                email: emailInput,
              },
              metadata: {
                channel: "customer-mypage",
                operation: "customer_profile_updated",
                ip: request.ip,
                userAgent: request.userAgent,
              },
            });
          })(),
          {
            operation: "auditCustomerProfileUpdate",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
          },
        );

        // SETTINGS-02 followup: 初回メールアドレス登録は本人確認 URL 経由に限定する
        // (Customer.email 直接更新は攻撃者が任意アドレスをなりすまし登録できるため)。
        // 現在 email 未登録 + 新規入力ありの場合のみ verification フローを起動。
        // 既に email 登録済みで変更しようとした場合は無視 (別途 changeEmail 手続きが必要)。
        const shouldRequestVerification =
          emailInput !== null &&
          (customer?.email === null ||
            customer?.email === undefined ||
            customer?.email === "");

        if (shouldRequestVerification && emailInput) {
          const ipLimit = await checkActionRateLimit(
            emailVerificationRequestRateLimiter,
          );
          if (!ipLimit.success) {
            return {
              ok: false,
              error:
                "確認メールの送信回数が上限に達しました。しばらく経ってから再度お試しください。",
            };
          }

          const emailLimit = await checkEmailRateLimit(
            emailVerificationByEmailRateLimiter,
            emailInput,
          );
          if (!emailLimit.success) {
            return {
              ok: false,
              error:
                "確認メールの送信回数が上限に達しました。しばらく経ってから再度お試しください。",
            };
          }

          try {
            const request = await requestCustomerEmailChangeCommand(
              session.user.id,
              emailInput,
            );

            const verificationUrl = new URL(
              "/mypage/settings/confirm-email",
              getAppUrl(),
            );
            verificationUrl.searchParams.set("token", request.rawToken);

            await sendChangeEmailVerificationEmail({
              email: emailInput,
              name: `${data.lastName} ${data.firstName}`.trim(),
              newEmail: emailInput,
              verificationUrl: verificationUrl.toString(),
            });

            return {
              ok: true,
              successMessage: EMAIL_VERIFICATION_SENT_MESSAGE,
            };
          } catch (error) {
            if (error instanceof DomainError) {
              return { ok: false, error: error.message };
            }
            logError(error, {
              category: ErrorCategory.EXTERNAL_API,
              severity: ErrorSeverity.HIGH,
              context: {
                operation: "requestCustomerEmailChange",
                userId: session.user.id,
              },
            });
            return {
              ok: false,
              error: "確認メールの送信に失敗しました",
            };
          }
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
