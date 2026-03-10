"use server";

/**
 * メール設定・通知設定 Server Actions
 *
 * @module admin/actions/settings/email
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
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
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateNotificationSettings(
  data: NotificationSettingsInput,
): Promise<MutationResult> {
  const parsed = notificationSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateNotificationSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}
