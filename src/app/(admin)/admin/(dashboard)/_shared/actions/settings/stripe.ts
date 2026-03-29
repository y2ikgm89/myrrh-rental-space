"use server";

/**
 * Stripe決済設定 Server Actions
 *
 * @module admin/actions/settings/stripe
 */

import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import * as stripeLib from "@/admin/lib/stripe";
import {
  stripeSettingsSchema,
  type StripeSettingsInput,
} from "@/admin/lib/validations/stripe";
import { DomainError } from "@/shared/domain/domain-error";
import * as settingsCommands from "@/shared/domain/settings/commands";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
  normalizeError,
} from "@/shared/lib/errors/server";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { omitUndefined } from "@/shared/lib/serialize";

// =============================================================================
// Actions
// =============================================================================

/**
 * Stripe設定を更新
 */
export async function updateStripeSettings(
  data: StripeSettingsInput,
): Promise<MutationResult> {
  const parsed = stripeSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.updateStripeSettings(omitUndefined(parsed.data));
      return null;
    },
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
): Promise<MutationResult<{ accountId?: string; mode?: "test" | "live" }>> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      const result = await stripeLib.testStripeConnection(secretKey);
      if (!result.success) {
        throw new DomainError(
          result.error ?? "接続テストに失敗しました",
          "VALIDATION",
        );
      }

      try {
        await settingsCommands.recordStripeConnectionSuccess(result.accountId);
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
      updateTag(CACHE_TAGS.SETTINGS);
    },
  });
}

/**
 * Stripeキーをクリア
 */
export async function clearStripeKeys(): Promise<MutationResult> {
  return executeAdminMutationResult({
    resource: "settings",
    action: "update",
    execute: async () => {
      await settingsCommands.clearStripeKeys();
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.SETTINGS);
    },
  });
}
