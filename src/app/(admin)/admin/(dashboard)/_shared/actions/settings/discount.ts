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
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import * as settingsCommands from "@/shared/domain/settings/commands";

import { discountSettingsSchema, type DiscountSettingsInput } from "./schemas";

export async function updateDiscountSettings(
  input: DiscountSettingsInput,
): Promise<MutationResult> {
  const parsed = discountSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateDiscountSettings(parsed.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.BUSINESS_SETTINGS);
    },
  });
}
