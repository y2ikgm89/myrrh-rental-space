"use server";

/**
 * Stripe決済設定 Server Actions
 *
 * @module admin/actions/settings/stripe
 */

import { updateTag } from "next/cache";
import type { SubmissionResult } from "@conform-to/react";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { executeConformMutation } from "@/shared/lib/forms/conform-action";
import * as stripeLib from "@/shared/lib/stripe";
import { stripeFormSchema } from "./schemas/form-schemas-security-integrations";
import { DomainError } from "@/shared/domain/domain-error";
import {
  clearStripeKeys as clearStripeKeysCommand,
  recordStripeConnectionSuccess,
  updateStripeSettings as updateStripeSettingsCommand,
} from "@/shared/domain/settings/integration-commands";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";

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
      execute: async () => {
        await updateStripeSettingsCommand({
          stripeEnabled: data.stripeEnabled,
          stripePublishableKey: data.stripePublishableKey || null,
          stripeSecretKey: data.stripeSecretKey || null,
          stripeWebhookSecret: data.stripeWebhookSecret || null,
          stripeCurrency: data.stripeCurrency,
        });
        return null;
      },
      afterSuccess: () => {
        updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
      },
    });
    if (isMutationError(result)) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  });
}

/**
 * Stripe接続テスト
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

      try {
        await recordStripeConnectionSuccess(result.accountId);
      } catch (error) {
        logError(normalizeError(error), {
          category: ErrorCategory.DATABASE,
          severity: ErrorSeverity.MEDIUM,
          context: { operation: "testStripeConnectionAction" },
        });
      }

      return {
        ...(result.accountId !== undefined && { accountId: result.accountId }),
        ...(result.mode !== undefined && { mode: result.mode }),
      };
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
    },
  });
}

/**
 * Stripeキーをクリア
 */
export async function clearStripeKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "manage",
    execute: async () => {
      await clearStripeKeysCommand();
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INTEGRATION_SETTINGS);
    },
  });
}
