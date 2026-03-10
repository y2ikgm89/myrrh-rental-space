"use server";

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result"
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
): Promise<MutationResult<{ warnings: string[] }>> {
  const parsed = robotsTxtSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => updateRobotsTxtSettingsCommand(parsed.data),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function resetRobotsTxtToDefault(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await resetRobotsTxtToDefaultCommand();
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}
