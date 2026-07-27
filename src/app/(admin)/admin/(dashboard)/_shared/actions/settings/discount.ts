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

import type { SubmissionResult } from "@conform-to/react";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import { updateDiscountSettings as updateDiscountSettingsCommand } from "@/shared/domain/settings/commands/commerce";
import { getDiscountSettings } from "@/shared/domain/settings/admin-queries";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";

import { discountFormSchema } from "./schemas/form-schemas-security-integrations";

/**
 * 割引設定更新 — conform `useActionState` 統合経路。
 *
 * `durationDiscountRules` は配列 (conform `form.insert`/`form.remove` で操作)。
 * 割引率は決済金額に直結するため、変更前後を AuditLog に残す
 * （executeAdminMutationResult の自動ログは resource/action のみで diff を持たない）。
 */
export async function updateDiscountSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, discountFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "manage",
      execute: async (user) => {
        const previous = await getDiscountSettings();
        const newValue = {
          durationDiscountEnabled: data.durationDiscountEnabled,
          durationDiscountRules: data.durationDiscountRules,
          discountCombinationMode: data.discountCombinationMode,
          showOriginalPrice: data.showOriginalPrice,
        };
        await updateDiscountSettingsCommand({
          durationDiscountEnabled: data.durationDiscountEnabled,
          durationDiscountRules: data.durationDiscountRules,
          discountCombinationMode: data.discountCombinationMode,
          showOriginalPrice: data.showOriginalPrice,
          expectedUpdatedAt: data.expectedUpdatedAt,
        });
        const { ip, userAgent } = await buildAuditRequestContext();
        return { previous, newValue, actorUserId: user.id, ip, userAgent };
      },
      afterSuccess: (outcome) => {
        invalidateSiteWideCache(CACHE_TAGS.BUSINESS_SETTINGS);

        fireAndForget(
          createAuditLogRecord({
            userId: outcome.actorUserId,
            action: "UPDATE",
            resource: "settings.discount",
            oldValue: outcome.previous,
            newValue: outcome.newValue,
            metadata: {
              ...(outcome.ip !== null && { ip: outcome.ip }),
              ...(outcome.userAgent !== null && {
                userAgent: outcome.userAgent,
              }),
            },
          }),
          {
            operation: "auditLogUpdateDiscountSettings",
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.MEDIUM,
          },
        );
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}
