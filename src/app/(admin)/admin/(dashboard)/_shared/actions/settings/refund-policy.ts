"use server";

/**
 * 返金ポリシー設定 Server Actions (task #9 PR#5 admin settings UI)
 *
 * `Settings.refundPolicy` (Json?) を書き込む thin admin action。
 *
 * ## 挙動
 * - `refundPolicyEnabled=false` → policy null 保存 (cancellation-side-effects の
 *   後方互換動作 = 残額全額返金 に戻す)
 * - `refundPolicyEnabled=true`  → tier array + defaultRefundRate を JSON 保存
 *
 * ## 権限
 * `settings:manage` (billing 設定と同一階層)。
 *
 * ## キャッシュ
 * 公開 site の refund 説明表示等が将来 refundPolicy を read する可能性を見越して
 * `CACHE_TAGS.BUSINESS_SETTINGS` を invalidate する (TaxSettings と同じ扱い)。
 */

import type { SubmissionResult } from "@conform-to/react";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import * as settingsCommands from "@/shared/domain/settings/commands";

import { refundPolicyFormSchema } from "./schemas/refund-policy";

export async function updateRefundPolicySettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(
    formData,
    refundPolicyFormSchema,
    async (data) => {
      const result = await executeAdminMutationResult({
        resource: "settings",
        action: "manage",
        execute: async () => {
          const policy = data.refundPolicyEnabled
            ? {
                tiers: data.refundPolicyTiers,
                defaultRefundRate: data.refundPolicyDefaultRefundRate,
              }
            : null;
          await settingsCommands.updateRefundPolicy(policy);
          return null;
        },
        afterSuccess: () => {
          invalidateSiteWideCache(CACHE_TAGS.BUSINESS_SETTINGS);
        },
      });
      if (isMutationError(result)) {
        return { ok: false, error: result.error };
      }
      return { ok: true };
    },
  );
}
