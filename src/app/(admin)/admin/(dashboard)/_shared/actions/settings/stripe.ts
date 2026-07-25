"use server";

/**
 * Stripe決済設定 Server Actions
 *
 * @module admin/actions/settings/stripe
 */

import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
// CACHE-DRIFT-SETTLE: INTEGRATION_SETTINGS は NEXTJS_TAG_TO_CDN_TAG 上「type-cleanliness
// のためだけの mapping」で、実 surface は admin-only (private,no-store)。CDN 経路には
// 露出しないため skipCdnPurge:true。helper 経由で local/no-raw-updatetag-for-cdn-mapped-
// cache-tag drift gate を通過させる。
import { invalidateSiteWideCache } from "@/shared/lib/cache/site-wide";
import * as stripeLib from "@/shared/lib/stripe";
import { stripeFormSchema } from "./schemas/form-schemas-security-integrations";
import { emptyToNull } from "./schemas/form-schema-helpers";
import { DomainError } from "@/shared/domain/domain-error";
import {
  clearStripeKeys as clearStripeKeysCommand,
  updateStripeSettings as updateStripeSettingsCommand,
} from "@/shared/domain/settings/integration-commands";
import {
  buildStripeSettingsAuditSnapshot,
  getStripeSettingsAuditSnapshot,
  type StripeSettingsAuditSnapshot,
} from "@/shared/domain/settings/admin-queries";
import { createAuditLogRecord } from "@/shared/domain/audit-log/commands";
import { buildAuditRequestContext } from "@/shared/lib/audit-request-context";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors/server";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";

type StripeAuditValue = StripeSettingsAuditSnapshot & {
  stripeSecretKeyRotated?: boolean;
  stripeWebhookSecretRotated?: boolean;
};

function withSecretRotationFlags(
  snapshot: StripeSettingsAuditSnapshot,
  rotation: {
    secretKey?: boolean;
    webhookSecret?: boolean;
  },
): StripeAuditValue {
  return {
    ...snapshot,
    ...(rotation.secretKey && { stripeSecretKeyRotated: true }),
    ...(rotation.webhookSecret && { stripeWebhookSecretRotated: true }),
  };
}

// =============================================================================
// Actions
// =============================================================================

/**
 * Stripe設定更新 — conform `useActionState` 統合経路。
 *
 * 空文字列フィールドは null 化して domain command に渡す。
 */
export async function updateStripeSettings(
  _prev: SubmissionResult | undefined,
  formData: FormData,
): Promise<SubmissionResult> {
  return executeConformMutation(formData, stripeFormSchema, async (data) => {
    const result = await executeAdminMutationResult({
      resource: "settings",
      action: "manage",
      execute: async (user) => {
        const previous = await getStripeSettingsAuditSnapshot();
        const secretKey = emptyToNull(data.stripeSecretKey);
        const webhookSecret = emptyToNull(data.stripeWebhookSecret);
        await updateStripeSettingsCommand({
          stripePublishableKey: emptyToNull(data.stripePublishableKey),
          stripeSecretKey: secretKey,
          stripeWebhookSecret: webhookSecret,
          stripeCurrency: data.stripeCurrency,
          stripePaymentMethodTypes: data.stripePaymentMethodTypes,
          expectedUpdatedAt: data.expectedUpdatedAt,
        });
        const next = await getStripeSettingsAuditSnapshot();
        const { ip, userAgent } = await buildAuditRequestContext();
        return {
          previous,
          newValue: withSecretRotationFlags(next, {
            ...(secretKey && { secretKey: true }),
            ...(webhookSecret && { webhookSecret: true }),
          }),
          actorUserId: user.id,
          ip,
          userAgent,
        };
      },
      afterSuccess: (outcome) => {
        invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
          skipCdnPurge: true,
        });

        fireAndForget(
          createAuditLogRecord({
            userId: outcome.actorUserId,
            action: "UPDATE",
            resource: "settings.stripe",
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
            operation: "auditLogUpdateStripeSettings",
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

/**
 * Stripe接続テスト — 未保存キーでの検証のみ。DB への接続状態書込は行わない。
 */
export async function testStripeConnectionAction(
  secretKey: string,
): Promise<MutationResult<{ accountId?: string; mode?: "test" | "live" }>> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      const result = await stripeLib.testStripeConnection(secretKey);
      if (!result.success) {
        throw new DomainError(
          result.error ?? "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      return {
        ...(result.accountId !== undefined && { accountId: result.accountId }),
        ...(result.mode !== undefined && { mode: result.mode }),
      };
    },
  });
}

/**
 * Stripeキーをクリア
 */
export async function clearStripeKeys(): Promise<
  MutationResult<{
    previous: StripeSettingsAuditSnapshot;
    newValue: StripeSettingsAuditSnapshot;
    actorUserId: string;
    ip: string | null;
    userAgent: string | null;
  }>
> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async (user) => {
      const previous = await getStripeSettingsAuditSnapshot();
      await clearStripeKeysCommand();
      const { ip, userAgent } = await buildAuditRequestContext();
      return {
        previous,
        newValue: buildStripeSettingsAuditSnapshot(null),
        actorUserId: user.id,
        ip,
        userAgent,
      };
    },
    afterSuccess: (outcome) => {
      invalidateSiteWideCache(CACHE_TAGS.INTEGRATION_SETTINGS, {
        skipCdnPurge: true,
      });

      fireAndForget(
        createAuditLogRecord({
          userId: outcome.actorUserId,
          action: "UPDATE",
          resource: "settings.stripe",
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
          operation: "auditLogClearStripeKeys",
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
        },
      );
    },
  });
}
