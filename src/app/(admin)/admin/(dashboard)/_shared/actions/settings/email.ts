"use server";

/**
 * メール設定・通知設定 Server Actions
 *
 * @module admin/actions/settings/email
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  updateEmailSettings as updateEmailSettingsCommand,
  updateNotificationSettings as updateNotificationSettingsCommand,
} from "@/shared/domain/settings/commands/organization";
import { DomainError } from "@/shared/domain/domain-error";

import { emptyToNull } from "./schemas/form-schema-helpers";
import {
  emailFormSchema,
  notificationFormSchema,
} from "./schemas/form-schemas-email-notification";
import { validateSenderDomain } from "@/shared/lib/email/domain-verification";
import type { SenderDomainCheck } from "@/shared/lib/email/domain-verification";
import { resolveSenderEmailAddress } from "@/shared/lib/email/client";
import { resolveEmailTransportContext } from "@/shared/domain/settings/queries/email-render-context";

function buildSenderDomainError(
  check: Extract<SenderDomainCheck, { ok: false }>,
): string {
  if (check.reason === "resend_unavailable") {
    return "Resend が未設定のため送信元ドメインを検証できません。管理画面の「連携設定」（/admin/settings/integrations）で Resend API キーを設定してください。";
  }
  if (check.reason === "resend_error") {
    return "Resend への接続に失敗したため送信元ドメインを検証できません。Resend の設定とネットワークを確認してから再度保存してください。";
  }
  const list =
    check.verifiedDomains.length > 0
      ? check.verifiedDomains.join(", ")
      : "（検証済みドメインがありません）";
  return `送信元アドレスのドメインが Resend で検証されていません。検証済みドメイン: ${list}`;
}

/**
 * メール設定の更新 — conform `useActionState` 統合経路。
 */
export async function updateEmailSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, emailFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        // 認可後に Resend で検証済みドメインかを確認する。未検証ドメインを from に
        // 使うと全送信が 403 になるため保存前に弾く。入力欄が空でも保存後の実効値は
        // env EMAIL_FROM にフォールバックするため、生の入力値ではなく
        // resolveSenderEmailAddress() の解決結果を検証する。
        //
        // env / DB のどちらにも sender が無い場合は resolveSenderEmailAddress が throw
        // する（silent fallback を廃止した M11 fix）。管理画面 UI 上は「入力欄空 + env 未配線」
        // で保存を試みたケースに相当するため、DomainError に変換して validation エラーとして
        // 返す（executeAdminMutationResult の isDomainError 分岐が MutationError に変換する）。
        let effectiveSenderEmail: string;
        try {
          effectiveSenderEmail = resolveSenderEmailAddress(
            emptyToNull(data.senderEmail),
          );
        } catch {
          throw new DomainError(
            "送信元アドレスが未設定です。送信元メールアドレスを入力してください。",
            "VALIDATION",
          );
        }
        const transport = await resolveEmailTransportContext();
        const check = await validateSenderDomain(
          effectiveSenderEmail,
          transport,
        );
        if (!check.ok) {
          throw new DomainError(buildSenderDomainError(check), "VALIDATION");
        }

        await updateEmailSettingsCommand({
          senderEmail: emptyToNull(data.senderEmail),
          senderName: emptyToNull(data.senderName),
          replyToEmail: emptyToNull(data.replyToEmail),
          sendReservationConfirmationEmail:
            data.sendReservationConfirmationEmail,
          notifyEventReminder: data.notifyEventReminder,
          notificationStaffIds: data.notificationStaffIds,
          notificationEmailAddresses: data.notificationEmailAddresses,
          expectedOrganizationUpdatedAt: data.expectedOrganizationUpdatedAt,
          expectedReservationUpdatedAt: data.expectedReservationUpdatedAt,
          expectedNotificationUpdatedAt: data.expectedNotificationUpdatedAt,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.NOTIFICATION_SETTINGS);
        invalidateSiteWideCache(CACHE_TAGS.BUSINESS_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * 通知設定の更新 — conform `useActionState` 統合経路。
 *
 * `useActionState` + `useForm` (conform) に clean break 移行。
 */
export async function updateNotificationSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    notificationFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "update",
        execute: async () => {
          await updateNotificationSettingsCommand(data);
          return null;
        },
        afterSuccess: () => {
          updateTag(CACHE_TAGS.NOTIFICATION_SETTINGS);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}
