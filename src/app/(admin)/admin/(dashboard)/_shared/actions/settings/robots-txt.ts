"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  resetRobotsTxtToDefault as resetRobotsTxtToDefaultCommand,
  updateRobotsTxtSettings as updateRobotsTxtSettingsCommand,
} from "@/shared/domain/settings/commands";

import {
  robotsTxtSettingsSchema,
  type RobotsTxtSettingsInput,
} from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateRobotsTxtSettings(
  data: RobotsTxtSettingsInput,
): Promise<ActionResult<{ warnings: string[] }>> {
  const parsed = robotsTxtSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => updateRobotsTxtSettingsCommand(parsed.data),
    success: ({ warnings }) => {
      const message =
        warnings.length > 0
          ? `robots.txt設定を更新しました（警告: ${warnings.length}件）`
          : "robots.txt設定を更新しました";
      return createSuccess(message, { warnings });
    },
    afterSuccess: invalidateSettingsCache,
  });
}

export async function resetRobotsTxtToDefault(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await resetRobotsTxtToDefaultCommand();
    },
    success: () => createSuccess("robots.txt設定をデフォルトに戻しました"),
    afterSuccess: invalidateSettingsCache,
  });
}
