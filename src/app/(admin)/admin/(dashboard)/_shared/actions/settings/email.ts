"use server";

/**
 * メール設定・通知設定 Server Actions
 *
 * @module admin/actions/settings/email
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  updateEmailSettings as updateEmailSettingsCommand,
  updateNotificationSettings as updateNotificationSettingsCommand,
} from "@/shared/domain/settings/commands";

import {
  emailSettingsSchema,
  notificationSettingsSchema,
  type EmailSettingsInput,
  type NotificationSettingsInput,
} from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateEmailSettings(
  data: EmailSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = emailSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateEmailSettingsCommand(parsed.data);
    },
    success: () => createSuccess("メール設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateNotificationSettings(
  data: NotificationSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = notificationSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateNotificationSettingsCommand(parsed.data);
    },
    success: () => createSuccess("通知設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}
