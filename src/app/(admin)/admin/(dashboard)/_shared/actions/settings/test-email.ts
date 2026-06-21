"use server";

/**
 * テスト送信 Server Action（メール設定の動作確認）
 *
 * Resend 公式推奨フル適用（React Email / tags / headers /
 * Idempotency-Key / simulator addresses）+ 既存 settings 保存と
 * 同じ domain gate で送信前検証する。
 *
 * @module admin/actions/settings/test-email
 */

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { DomainError } from "@/shared/domain/domain-error";
import { type MutationResult } from "@/shared/lib/mutation-result";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { validateSenderDomain } from "@/shared/lib/email/domain-verification";
import { sendTestEmail } from "@/shared/lib/email/test-email";
import { getEmailDeliverySettings } from "@/shared/domain/settings/queries/notification";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import {
  authMutationRateLimiter,
  getClientIpFromHeaders,
} from "@/shared/lib/rate-limit";

const SIMULATOR_DOMAINS: ReadonlySet<string> = new Set(["resend.dev"]);

const recipientSchema = z
  .email({ error: "有効なメールアドレスを入力してください" })
  .max(100, { error: "メールアドレスは 100 文字以内で入力してください" });

export async function sendTestEmailAction(
  recipient: string,
  options?: { simulatorAddress?: boolean },
): Promise<MutationResult<{ messageId: string }>> {
  const parsed = recipientSchema.safeParse(recipient);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }
  const to = parsed.data;
  const isSimulator =
    options?.simulatorAddress ??
    SIMULATOR_DOMAINS.has(to.split("@")[1]?.toLowerCase() ?? "");

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async (user) => {
      // 1. rate-limit（IP 単位、authMutationRateLimiter: 20/15min）
      const ip = await getClientIpFromHeaders();
      const limit = await authMutationRateLimiter.check(ip);
      if (!limit.success) {
        throw new DomainError(
          "リクエストが多すぎます。しばらくしてからお試しください",
          "VALIDATION",
        );
      }

      // 2. sender domain gate（settings 保存と同 SSoT）
      const delivery = await getEmailDeliverySettings();
      if (delivery.senderEmail) {
        const check = await validateSenderDomain(delivery.senderEmail);
        if (!check.ok) {
          const list =
            check.verifiedDomains.length > 0
              ? check.verifiedDomains.join(", ")
              : "（検証済みドメインがありません）";
          throw new DomainError(
            `送信元アドレスのドメインが Resend で検証されていません。検証済みドメイン: ${list}`,
            "VALIDATION",
          );
        }
      }

      // 3. siteName を解決して sendTestEmail を呼ぶ
      const seo = await getSeoSettings();
      const result = await sendTestEmail({
        to,
        staffId: user.id,
        triggeredByEmail: user.email,
        triggeredByName: user.name ?? user.email,
        siteName: seo?.siteName ?? "Myrrh Rental Space",
        simulatorAddress: isSimulator,
      });

      if (!result.ok) {
        if (result.reason === "disabled") {
          throw new DomainError(
            "メール送信が無効です（RESEND_API_KEY が設定されていません）",
            "VALIDATION",
          );
        }
        throw new DomainError(result.error, "UNEXPECTED");
      }

      return { messageId: result.messageId };
    },
  });
}
