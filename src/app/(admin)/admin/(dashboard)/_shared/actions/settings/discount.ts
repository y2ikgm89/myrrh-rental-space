"use server";

/**
 * 割引設定 Server Actions
 *
 * 長時間割引の設定を管理:
 * - 有効/無効
 * - 割引ルール（時間閾値と割引率）— useFieldArray 配列
 * - 割引併用モード
 * - 表示設定
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import * as settingsCommands from "@/shared/domain/settings/commands";

import { discountFormSchema } from "./schemas/form-schemas-security-integrations";

/**
 * 割引設定更新 — conform `useActionState` 統合経路。
 *
 * `durationDiscountRules` は配列 (conform `form.insert`/`form.remove` で操作)。
 */
export async function updateDiscountSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, discountFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "update",
      execute: async () => {
        await settingsCommands.updateDiscountSettings({
          durationDiscountEnabled: data.durationDiscountEnabled,
          durationDiscountRules: data.durationDiscountRules,
          discountCombinationMode: data.discountCombinationMode,
          showOriginalPrice: data.showOriginalPrice,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.BUSINESS_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
