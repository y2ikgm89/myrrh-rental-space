"use server";

/**
 * メール設定・通知設定 Server Actions
 *
 * @module admin/actions/settings/email
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  updateEmailSettings as updateEmailSettingsCommand,
  updateNotificationSettings as updateNotificationSettingsCommand,
} from "@/shared/domain/settings/commands";

import {
  emailSettingsSchema,
  notificationSettingsSchema,
  type EmailSettingsInput,
} from "./schemas";

export async function updateEmailSettings(
  data: EmailSettingsInput,
): Promise<MutationResult> {
  const parsed = emailSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateEmailSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.NOTIFICATION_SETTINGS);
    },
  });
}

/**
 * 通知設定の更新 — conform `useActionState` 統合経路。
 *
 * Phase 1 Task 5 conform 移行で `useFormAction` (RHF) から
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
