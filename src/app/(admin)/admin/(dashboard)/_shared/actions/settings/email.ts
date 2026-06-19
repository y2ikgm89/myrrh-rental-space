"use server";

/**
 * メール設定・通知設定 Server Actions
 *
 * @module admin/actions/settings/email
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import {
  updateEmailSettings as updateEmailSettingsCommand,
  updateNotificationSettings as updateNotificationSettingsCommand,
} from "@/shared/domain/settings/commands";

import { emptyToNull } from "./schemas/form-schema-helpers";
import {
  emailFormSchema,
  notificationFormSchema,
} from "./schemas/form-schemas-email-notification";
import { validateSenderDomain } from "@/shared/lib/email/domain-verification";

/**
 * メール設定の更新 — conform `useActionState` 統合経路。
 */
export async function updateEmailSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, emailFormSchema, async (data) => {
    // 送信元アドレスを設定する場合、Resend で検証済みドメインかを保存前に確認する
    // （未検証ドメインを from に使うと全送信が 403 になるため事故を防ぐ）。
    if (data.senderEmail) {
      const check = await validateSenderDomain(data.senderEmail);
      if (!check.ok) {
        const list =
          check.verifiedDomains.length > 0
            ? check.verifiedDomains.join(", ")
            : "（検証済みドメインがありません）";
        return {
          ok: false,
          error: `送信元アドレスのドメインが Resend で検証されていません。検証済みドメイン: ${list}`,
        };
      }
    }

    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await updateEmailSettingsCommand({
          senderEmail: emptyToNull(data.senderEmail),
          senderName: emptyToNull(data.senderName),
          replyToEmail: emptyToNull(data.replyToEmail),
          sendReservationConfirmationEmail:
            data.sendReservationConfirmationEmail,
          notificationEmailAddresses: emptyToNull(
            data.notificationEmailAddresses,
          ),
        });
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
