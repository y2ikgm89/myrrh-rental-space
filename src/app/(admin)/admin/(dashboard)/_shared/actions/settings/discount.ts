"use server";

/**
 * 割引設定 Server Actions
 *
 * 長時間割引の設定を管理
 * - 有効/無効
 * - 割引ルール（時間閾値と割引率）
 * - 割引併用モード
 * - 表示設定
 */

import { updateTag } from "next/cache";
import { DiscountCombinationMode } from "@/shared/db/enums";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationError } from "@/shared/lib/action-helpers";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import {
  getDiscountSettings as getDiscountSettingsQuery,
} from "@/shared/domain/settings/admin-queries";
import {
  updateDiscountSettings as updateDiscountSettingsCommand,
} from "@/shared/domain/settings/commands";
import type { DiscountSettingsData } from "@/shared/domain/settings/types";

import { discountSettingsSchema, type DiscountSettingsInput } from "./schemas";

const checkReadPermission = checkReadPermissionFor("settings");

const DEFAULT_DISCOUNT_SETTINGS: DiscountSettingsData = {
  durationDiscountEnabled: false,
  durationDiscountRules: [],
  discountCombinationMode: DiscountCombinationMode.best,
  showOriginalPrice: true,
  discountWarningEnabled: true,
};

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  if (!(await checkReadPermission())) {
    return DEFAULT_DISCOUNT_SETTINGS;
  }

  return getDiscountSettingsQuery();
}

export async function updateDiscountSettings(
  input: DiscountSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = discountSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateDiscountSettingsCommand(parsed.data);
    },
    success: () => createSuccess("割引設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}
