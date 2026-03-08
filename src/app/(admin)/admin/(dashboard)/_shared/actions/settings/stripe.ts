"use server";

/**
 * Stripe決済設定 Server Actions
 *
 * @module admin/actions/settings/stripe
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createSuccess,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { executeAdminMutation } from "@/admin/lib/admin-action";
import { testStripeConnection as testStripeConnectionLib } from "@/admin/lib/stripe";
import {
  stripeSettingsSchema,
  type StripeSettingsInput,
} from "@/admin/lib/validations/stripe";
import { DomainError } from "@/shared/domain/domain-error";
import {
  clearStripeKeys as clearStripeKeysCommand,
  recordStripeConnectionSuccess,
  updateStripeSettings as updateStripeSettingsCommand,
} from "@/shared/domain/settings/commands";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";

// =============================================================================
// Actions
// =============================================================================

/**
 * Stripe設定を更新
 */
export async function updateStripeSettings(
  data: StripeSettingsInput,
): Promise<ActionResult<void>> {
  const parsed = stripeSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await updateStripeSettingsCommand(parsed.data);
    },
    success: () => createSuccess("Stripe設定を更新しました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SETTINGS);
    },
  });
}

/**
 * Stripe接続テスト
 */
export async function testStripeConnectionAction(
  secretKey: string,
): Promise<ActionResult<{ accountId?: string; mode?: "test" | "live" }>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await testStripeConnectionLib(secretKey);
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
        accountId: result.accountId,
        mode: result.mode,
      };
    },
    success: (result) => createSuccess("Stripe接続テストに成功しました", result),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SETTINGS);
    },
  });
}

/**
 * Stripeキーをクリア
 */
export async function clearStripeKeys(): Promise<ActionResult<void>> {
  return executeAdminMutation({
    resource: "settings",
    action: "update",
    execute: async () => {
      await clearStripeKeysCommand();
    },
    success: () => createSuccess("Stripeキーをクリアしました"),
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SETTINGS);
    },
  });
}
