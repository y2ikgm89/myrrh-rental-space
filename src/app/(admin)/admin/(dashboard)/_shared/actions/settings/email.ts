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

import { emailSettingsSchema, notificationSettingsSchema } from "./schemas";

/**
 * メール設定の更新 — conform `useActionState` 統合経路。
 */
export async function updateEmailSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, emailSettingsSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await updateEmailSettingsCommand(data);
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
    notificationSettingsSchema,
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
