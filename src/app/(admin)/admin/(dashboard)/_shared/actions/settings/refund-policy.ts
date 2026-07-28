"use server";

/**
 * 返金ポリシー設定 Server Actions (task #9 PR#5 admin settings UI)
 *
 * `Settings.refundPolicy` (Json?) を書き込む thin admin action。
 *
 * ## 挙動
 * - `refundPolicyEnabled=false` → policy null 保存 (意図的未設定 = 残額全額自動返金)
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
import { updateRefundPolicy as updateRefundPolicyCommand } from "@/shared/domain/settings/commands/commerce";
import { getRefundPolicySettings } from "@/shared/domain/settings/admin-queries";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";

import { refundPolicyFormSchema } from "./schemas/refund-policy";

/**
 * 返金ポリシー変更 — 返金額の算定ルールに直結するため、変更前後を AuditLog に残す
 * （executeAdminMutationResult の自動ログは resource/action のみで diff を持たない）。
 */
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
        execute: async (user) => {
          const previousData = await getRefundPolicySettings();
          const previous = previousData.resolution;
          const policy = data.refundPolicyEnabled
            ? {
                tiers: data.refundPolicyTiers,
                defaultRefundRate: data.refundPolicyDefaultRefundRate,
              }
            : null;
          await updateRefundPolicyCommand({
            policy,
            expectedUpdatedAt: data.expectedUpdatedAt,
          });
          const { ip, userAgent } = await buildAuditRequestContext();
          return { previous, policy, actorUserId: user.id, ip, userAgent };
        },
        afterSuccess: (outcome) => {
          invalidateSiteWideCache(CACHE_TAGS.BUSINESS_SETTINGS);

          fireAndForget(
            createAuditLogRecord({
              userId: outcome.actorUserId,
              action: "UPDATE",
              resource: "settings.refundPolicy",
              oldValue: { refundPolicy: outcome.previous },
              newValue: { refundPolicy: outcome.policy },
              metadata: {
                ...(outcome.ip !== null && { ip: outcome.ip }),
                ...(outcome.userAgent !== null && {
                  userAgent: outcome.userAgent,
                }),
              },
            }),
            {
              operation: "auditLogUpdateRefundPolicy",
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
    },
  );
}
