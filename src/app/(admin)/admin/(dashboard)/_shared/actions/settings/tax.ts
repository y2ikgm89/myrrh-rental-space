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
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { updateTaxSettings as updateTaxSettingsCommand } from "@/shared/domain/settings/commands";

import { taxSettingsSchema, type TaxSettingsInput } from "./schemas";

function invalidateSettingsCache(): void {
  updateTag(CACHE_TAGS.SETTINGS);
}

export async function updateTaxSettings(
  input: TaxSettingsInput,
): Promise<MutationResult> {
  const parsed = taxSettingsSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateTaxSettingsCommand(parsed.data);
      return null;
    },
    afterSuccess: invalidateSettingsCache,
  });
}
