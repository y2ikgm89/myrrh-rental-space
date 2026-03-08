"use server";

/**
 * 基本情報・レイアウト・SEO設定 Server Actions
 *
 * @module admin/actions/settings/basic
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
  updateBasicInfo as updateBasicInfoCommand,
  updateLayoutSettings as updateLayoutSettingsCommand,
  updateSeoSettings as updateSeoSettingsCommand,
} from "@/shared/domain/settings/commands";

import {
  basicInfoSchema,
  layoutSettingsSchema,
  seoSettingsSchema,
  type BasicInfoInput,
  type LayoutSettingsInput,
  type SeoSettingsInput,
} from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateBasicInfo(
  data: BasicInfoInput,
): Promise<ActionResult<void>> {
  const parsed = basicInfoSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateBasicInfoCommand(parsed.data);
    },
    success: () => createSuccess("基本情報を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateLayoutSettings(
  data: LayoutSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = layoutSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateLayoutSettingsCommand(parsed.data);
    },
    success: () => createSuccess("レイアウト設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}

export async function updateSeoSettings(
  data: SeoSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = seoSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateSeoSettingsCommand(parsed.data);
    },
    success: () => createSuccess("SEO設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}
