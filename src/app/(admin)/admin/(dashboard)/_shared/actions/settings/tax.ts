"use server";

/**
 * 消費税設定 Server Actions
 *
 * 消費税関連の設定を管理
 * - 標準税率・軽減税率
 * - 価格表示モード（管理画面・公開ページ）
 * - 価格入力モード
 */

import type { SubmissionResult } from "@conform-to/react";
import { invalidateSiteWideCache } from "@/shared/lib/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import { isMutationError } from "@/shared/lib/mutation-result";
import * as settingsCommands from "@/shared/domain/settings/commands";
import { getTaxSettings } from "@/shared/domain/settings/admin-queries";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";

import { taxSettingsSchema } from "./schemas";

/**
 * 消費税設定の更新 — conform `useActionState` 統合経路。
 *
 * 税率は決済金額に直結するため、変更前後を AuditLog に残す
 * （executeAdminMutationResult の自動ログは resource/action のみで diff を持たない）。
 */
export async function updateTaxSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, taxSettingsSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "manage",
      execute: async (user) => {
        const previous = await getTaxSettings();
        await settingsCommands.updateTaxSettings(data);
        const { ip, userAgent } = await buildAuditRequestContext();
        return { previous, data, actorUserId: user.id, ip, userAgent };
      },
      afterSuccess: (outcome) => {
        invalidateSiteWideCache(CACHE_TAGS.BUSINESS_SETTINGS);

        fireAndForget(
          createAuditLogRecord({
            userId: outcome.actorUserId,
            action: "UPDATE",
            resource: "settings.tax",
            oldValue: {
              taxStandardRate: outcome.previous.standardRate,
              taxReducedRate: outcome.previous.reducedRate,
              taxDisplayModePublic: outcome.previous.displayModePublic,
            },
            newValue: {
              taxStandardRate: outcome.data.taxStandardRate,
              taxReducedRate: outcome.data.taxReducedRate,
              taxDisplayModePublic: outcome.data.taxDisplayModePublic,
            },
            metadata: {
              ...(outcome.ip !== null && { ip: outcome.ip }),
              ...(outcome.userAgent !== null && {
                userAgent: outcome.userAgent,
              }),
            },
          }),
          {
            operation: "auditLogUpdateTaxSettings",
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
