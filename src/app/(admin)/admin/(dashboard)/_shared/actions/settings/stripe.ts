"use server";

/**
 * Stripe決済設定 Server Actions
 *
 * @module admin/actions/settings/stripe
 */

import { prisma } from "@/shared/lib/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS } from "@/shared/lib/constants";
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { withPermission } from "@/admin/lib/server-action-helpers";
import { encrypt } from "@/shared/lib/crypto";
import { testStripeConnection as testStripeConnectionLib } from "@/admin/lib/stripe";
import {
  stripeSettingsSchema,
  type StripeSettingsInput,
} from "@/admin/lib/validations/stripe";
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
export const updateStripeSettings = withPermission<
  [data: StripeSettingsInput],
  void
>(
  "settings",
  "update",
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = stripeSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  // シークレットキーを暗号化
  const updateData: Record<string, unknown> = {
    stripeEnabled: parsed.data.stripeEnabled,
    stripeTestMode: parsed.data.stripeTestMode,
    stripePublishableKey: parsed.data.stripePublishableKey || null,
    stripeCurrency: parsed.data.stripeCurrency,
  };

  // シークレットキーが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.stripeSecretKey) {
    try {
      updateData["stripeSecretKey"] = encrypt(parsed.data.stripeSecretKey);
    } catch {
      return createFailure(
        "シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
      );
    }
  }

  // Webhookシークレットが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.stripeWebhookSecret) {
    try {
      updateData["stripeWebhookSecret"] = encrypt(
        parsed.data.stripeWebhookSecret,
      );
    } catch {
      return createFailure(
        "Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
      );
    }
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Stripe設定を更新しました");
});

/**
 * Stripe接続テスト
 */
export const testStripeConnectionAction = withPermission<
  [secretKey: string],
  { accountId?: string; mode?: "test" | "live" }
>(
  "settings",
  "update",
)(async (_user, secretKey) => {
  const result = await testStripeConnectionLib(secretKey);

  if (!result.success) {
    return createFailure(result.error ?? "接続テストに失敗しました");
  }

  // 接続成功時、ステータスをDBに記録
  try {
    await prisma.settings.upsert({
      where: { id: "singleton" },
      create: {
        id: "singleton",
        stripeLastTestedAt: new Date(),
        stripeConnectionStatus: "connected",
        stripeAccountId: result.accountId,
      },
      update: {
        stripeLastTestedAt: new Date(),
        stripeConnectionStatus: "connected",
        stripeAccountId: result.accountId,
      },
    });
    updateTag(CACHE_TAGS.SETTINGS);
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: "testStripeConnectionAction" },
    });
  }

  return createSuccess("Stripe接続テストに成功しました", {
    accountId: result.accountId,
    mode: result.mode,
  });
});

/**
 * Stripeキーをクリア
 */
export const clearStripeKeys = withPermission<[], void>(
  "settings",
  "update",
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Stripeキーをクリアしました");
});
