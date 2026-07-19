"use server";

/**
 * メールテンプレート テスト送信 Server Action
 *
 * 管理画面で選んだテンプレに registry の fixture を当て、指定 recipient に実送信する。
 * production 送信パス（src/shared/lib/email/*-emails.ts）は通らず、registry の
 * sendTest が `sendEmail` を直接呼ぶ。subject は必ず `[TEST]` プレフィックス。
 *
 * `__infra_check` の場合、registry の mergeInfraCheckRuntime が SendTestInput から
 * recipientLabel / triggeredBy* / siteName / timestamp を runtime で上書きする
 * （TestEmail に実際の送信コンテキストを反映）。
 *
 * @module admin/actions/settings/template-test-send
 */

import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { DomainError } from "@/shared/domain/domain-error";
import { getEmailFooterData } from "@/shared/emails/_shared/footer-data";
import { getTemplate } from "@/shared/emails/_registry";
import {
  TEMPLATE_KEYS,
  type TemplateKey,
} from "@/shared/emails/_registry/data";
import { getEmailDeliverySettings } from "@/shared/domain/settings/queries/notification";
import { getSeoSettings } from "@/shared/domain/settings/queries/site";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { validateSenderDomain } from "@/shared/lib/email/domain-verification";
import { resolveSenderEmailAddress } from "@/shared/lib/email/client";
import { type MutationResult } from "@/shared/lib/mutation-result";
import { templateTestSendRateLimiter } from "@/shared/lib/rate-limit";

const keySchema = z.enum(TEMPLATE_KEYS, {
  error: "テンプレート種別が不正です",
});

const recipientSchema = z
  .email({ error: "有効なメールアドレスを入力してください" })
  .max(100, { error: "メールアドレスは 100 文字以内で入力してください" });

const SIMULATOR_DOMAINS: ReadonlySet<string> = new Set(["resend.dev"]);

export async function sendTemplateTestAction(
  key: TemplateKey,
  recipient: string,
  options?: { useRealFooter?: boolean; simulatorAddress?: boolean },
): Promise<MutationResult<{ messageId: string }>> {
  const keyParsed = keySchema.safeParse(key);
  if (!keyParsed.success) {
    return createValidationMutationError(
      keyParsed.error,
      keyParsed.error.issues[0]?.message ?? "テンプレート種別が不正です",
    );
  }
  const recipParsed = recipientSchema.safeParse(recipient);
  if (!recipParsed.success) {
    return createValidationMutationError(
      recipParsed.error,
      recipParsed.error.issues[0]?.message ?? "入力に誤りがあります",
    );
  }

  const validKey = keyParsed.data;
  const to = recipParsed.data;

  // simulator フラグは `__infra_check` のみで意味を持つ。他テンプレで指定されても無視。
  const simulatorFlag =
    validKey === "__infra_check"
      ? (options?.simulatorAddress ??
        SIMULATOR_DOMAINS.has(to.split("@")[1]?.toLowerCase() ?? ""))
      : false;

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async (user) => {
      // 1. rate-limit（user.id 単位、templateTestSendRateLimiter: 10/15min の
      //    専用バケット）。IP 単位の authMutationRateLimiter (20/15min) を再利用すると
      //    Better Auth 顧客サインインと同じ egress IP バケットに結合してしまい、
      //    管理者の全テンプレ検証が顧客ログインを 15 分ロックする（逆も同様）ため、
      //    user.id にキーを移して per-admin の独立バケットで防御する。
      const limit = await templateTestSendRateLimiter.check(user.id);
      if (!limit.success) {
        throw new DomainError(
          "リクエストが多すぎます。しばらくしてからお試しください",
          "VALIDATION",
        );
      }

      // 2. sender domain gate（settings 保存と同 SSoT、`__infra_check` でも適用）。
      // delivery.senderEmail が null（未設定）でも実送信は resolveSenderEmailAddress の
      // env `EMAIL_FROM` フォールバックが効くため、そのフォールバック先を検証する
      // （DB 値の有無で判定すると未検証ドメインへの実送信を見逃し Resend 403 になる）。
      //
      // env / DB のどちらにも sender が無い場合は resolveSenderEmailAddress が throw する
      // （silent fallback を廃止した M11 fix）。テスト送信は絶対に成功しないため、
      // DomainError に変換して operator に設定不備を surface する。
      const delivery = await getEmailDeliverySettings();
      let effectiveSenderEmail: string;
      try {
        effectiveSenderEmail = resolveSenderEmailAddress(delivery.senderEmail);
      } catch {
        throw new DomainError(
          "送信元アドレスが未設定です。管理画面のメール設定で送信元メールアドレスを入力してください。",
          "VALIDATION",
        );
      }
      const check = await validateSenderDomain(effectiveSenderEmail);
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

      // 3. fixture override（useRealFooter のみ。__infra_check の identity 上書きは
      //    registry 側 mergeInfraCheckRuntime が自動で行う）
      const fixtureOverride = options?.useRealFooter
        ? { footer: await getEmailFooterData() }
        : undefined;

      const entry = getTemplate(validKey);
      const seo = await getSeoSettings();
      const siteName = seo?.siteName ?? "Myrrh Rental Space";

      const result = await entry.sendTest({
        to,
        staffId: user.id,
        triggeredByEmail: user.email,
        triggeredByName: user.name ?? user.email,
        siteName,
        simulatorAddress: simulatorFlag,
        ...(fixtureOverride !== undefined && { fixtureOverride }),
      });

      if (!result.ok) {
        if (result.reason === "disabled") {
          throw new DomainError(
            "メール送信が無効です（RESEND_API_KEY が設定されていません）",
            "VALIDATION",
          );
        }
        if (result.reason === "suppressed") {
          throw new DomainError(
            "送信先は配信停止（バウンス/苦情）登録済みのため送信できません",
            "VALIDATION",
          );
        }
        throw new DomainError(result.error, "UNEXPECTED");
      }

      return { messageId: result.messageId };
    },
  });
}
