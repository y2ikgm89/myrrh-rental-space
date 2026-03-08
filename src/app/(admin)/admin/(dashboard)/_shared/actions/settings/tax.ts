"use server";

/**
 * 消費税設定 Server Actions
 *
 * 消費税関連の設定を管理
 * - 標準税率・軽減税率
 * - 価格表示モード（管理画面・公開ページ）
 * - 価格入力モード
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
  updateTaxSettings as updateTaxSettingsCommand,
} from "@/shared/domain/settings/commands";

import { taxSettingsSchema, type TaxSettingsInput } from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateTaxSettings(
  input: TaxSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = taxSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTaxSettingsCommand(parsed.data);
    },
    success: () => createSuccess("消費税設定を更新しました"),
    afterSuccess: invalidateSettingsCache,
  });
}
