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
        // Codex P1 (comment_id=3566958375): 初回 email 登録を command 層へ届ける。
        // email はスキーマ上 optional で `""` or 有効 email。空文字/未送信を null に
        // 正規化して渡すことで、command 側の shouldRegisterEmail 判定
        // (現 email が空 かつ 新 email が有効値のときのみ適用) に正しく載せる。
        // これが無いと LINE OAuth 由来で Customer.email が空のユーザーは
        // settings 保存が「成功したのに email が変わらず」mypage layout の
        // `!customer.email` redirect で settings に閉じ込められる。
        const emailInput =
          typeof data.email === "string" && data.email.length > 0
            ? data.email
            : null;
        await updateCustomerProfileByUserId(session.user.id, {
          customerType: data.customerType,
          lastName: data.lastName,
          firstName: data.firstName,
          companyName: data.companyName || null,
          phoneNumber: data.phoneNumber || null,
          email: emailInput,
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
