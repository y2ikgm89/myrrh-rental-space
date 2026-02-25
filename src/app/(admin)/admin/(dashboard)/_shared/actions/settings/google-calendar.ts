"use server";

/**
 * Google Calendar連携 Server Actions
 *
 * @module admin/actions/settings/google-calendar
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
import {
  testServiceAccountConnection,
  testOAuthConnection,
  encryptServiceAccountJson,
  isValidCalendarId,
  getGoogleCalendarSettings,
  setupWebhookWatch,
  stopWebhookWatch,
} from "@/shared/lib/google-calendar";
import { syncFromCalendar } from "@/shared/lib/calendar-sync";
import { serverEnv } from "@/shared/lib/env/server";
import { clientEnv } from "@/shared/lib/env/client";

import {
  googleCalendarSettingsSchema,
  twoWaySyncSettingsSchema,
  type GoogleCalendarSettingsInput,
  type TwoWaySyncSettingsInput,
} from "./schemas";

// =============================================================================
// Actions
// =============================================================================

/**
 * Google Calendar設定を更新
 */
export const updateGoogleCalendarSettings = withPermission<
  [data: GoogleCalendarSettingsInput],
  void
>(
  "settings",
  "update",
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = googleCalendarSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  // カレンダーIDのバリデーション
  if (
    parsed.data.googleCalendarId &&
    !isValidCalendarId(parsed.data.googleCalendarId)
  ) {
    return createFailure("カレンダーIDの形式が無効です");
  }

  const updateData: Record<string, unknown> = {
    googleCalendarEnabled: parsed.data.googleCalendarEnabled,
    googleCalendarId: parsed.data.googleCalendarId || null,
    icalAttachmentEnabled: parsed.data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: parsed.data.addToCalendarLinksEnabled,
  };

  // サービスアカウントJSONが入力された場合のみ更新（暗号化して保存）
  if (parsed.data.serviceAccountJson) {
    try {
      // JSONとして有効か確認
      JSON.parse(parsed.data.serviceAccountJson);
      updateData["googleCalendarServiceAccountJson"] =
        encryptServiceAccountJson(parsed.data.serviceAccountJson);
    } catch {
      return createFailure("サービスアカウントJSONの形式が無効です");
    }
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Google Calendar設定を更新しました");
});

/**
 * サービスアカウント接続テスト
 */
export const testGoogleCalendarConnectionAction = withPermission<
  [params: { serviceAccountJson: string; calendarId: string }],
  { calendarName: string; accountEmail: string }
>(
  "settings",
  "update",
)(async (_user, params) => {
  if (!isValidCalendarId(params.calendarId)) {
    return createFailure("カレンダーIDの形式が無効です");
  }

  const result = await testServiceAccountConnection({
    serviceAccountJson: params.serviceAccountJson,
    calendarId: params.calendarId,
  });

  if (!result.success) {
    await prisma.settings.update({
      where: { id: "singleton" },
      data: { googleCalendarConnectionStatus: "error" },
    });
    return createFailure(result.error ?? "接続テストに失敗しました");
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarLastTestedAt: new Date(),
      googleCalendarConnectionStatus: "connected",
    },
    update: {
      googleCalendarLastTestedAt: new Date(),
      googleCalendarConnectionStatus: "connected",
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("接続テストに成功しました", {
    calendarName: result.calendarName ?? "",
    accountEmail: result.accountEmail ?? "",
  });
});

/**
 * OAuth接続テスト（管理者の個人カレンダー）
 */
export const testGoogleCalendarOAuthAction = withPermission<
  [],
  { calendarName: string }
>(
  "settings",
  "update",
)(async (user) => {
  const result = await testOAuthConnection(user.id);

  if (!result.success) {
    return createFailure(result.error ?? "OAuth接続テストに失敗しました");
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleCalendarOAuthEnabled: true },
    update: { googleCalendarOAuthEnabled: true },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("OAuth接続テストに成功しました", {
    calendarName: result.calendarName ?? "",
  });
});

/**
 * Google Calendarサービスアカウント認証情報をクリア
 */
export const clearGoogleCalendarServiceAccount = withPermission<[], void>(
  "settings",
  "update",
)(async (): Promise<ActionResult<void>> => {
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("サービスアカウント認証情報をクリアしました");
});

/**
 * Google Calendar OAuth連携を解除
 */
export const disconnectGoogleCalendarOAuth = withPermission<[], void>(
  "settings",
  "update",
)(async (user): Promise<ActionResult<void>> => {
  // Accountテーブルからトークンを削除
  await prisma.account.deleteMany({
    where: {
      userId: user.id,
      providerId: "google",
    },
  });

  // OAuth有効フラグをオフ
  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarOAuthEnabled: false,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Google Calendar OAuth連携を解除しました");
});

/**
 * Google Calendar設定を取得（公開用）
 */
export { getGoogleCalendarSettings };

// =============================================================================
// Two-Way Sync Actions
// =============================================================================

/**
 * 双方向同期設定を更新
 */
export const updateTwoWaySyncSettings = withPermission<
  [data: TwoWaySyncSettingsInput],
  void
>(
  "settings",
  "update",
)(async (_user, data): Promise<ActionResult<void>> => {
  const parsed = twoWaySyncSettingsSchema.safeParse(data);
  if (!parsed.success) {
    return createValidationError(parsed.error);
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarTwoWaySyncEnabled: parsed.data.enabled,
      googleCalendarSyncMethod: parsed.data.syncMethod,
      googleCalendarPollingIntervalMin: parsed.data.pollingIntervalMin,
    },
    update: {
      googleCalendarTwoWaySyncEnabled: parsed.data.enabled,
      googleCalendarSyncMethod: parsed.data.syncMethod,
      googleCalendarPollingIntervalMin: parsed.data.pollingIntervalMin,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("双方向同期設定を更新しました");
});

/**
 * Webhookを設定
 */
export const setupCalendarWebhook = withPermission<
  [],
  { expiration: Date | undefined }
>(
  "settings",
  "update",
)(async () => {
  const baseUrl = clientEnv.NEXT_PUBLIC_APP_URL ?? serverEnv.BETTER_AUTH_URL;
  if (!baseUrl) {
    return createFailure("APP_URLが設定されていません");
  }

  const webhookUrl = `${baseUrl.startsWith("http") ? baseUrl : `https://${baseUrl}`}/api/webhooks/google-calendar`;
  const result = await setupWebhookWatch(webhookUrl);

  if (!result.success || !result.channelId || !result.resourceId) {
    return createFailure(result.error ?? "Webhook設定に失敗しました");
  }

  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarWebhookChannelId: result.channelId,
      googleCalendarWebhookResourceId: result.resourceId,
      googleCalendarWebhookExpiration: result.expiration,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Webhookを設定しました", {
    expiration: result.expiration,
  });
});

/**
 * Webhookを停止
 */
export const stopCalendarWebhook = withPermission<[], void>(
  "settings",
  "update",
)(async () => {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookResourceId: true,
    },
  });

  if (
    !settings?.googleCalendarWebhookChannelId ||
    !settings.googleCalendarWebhookResourceId
  ) {
    return createFailure("Webhookが設定されていません");
  }

  const result = await stopWebhookWatch(
    settings.googleCalendarWebhookChannelId,
    settings.googleCalendarWebhookResourceId,
  );

  if (!result.success) {
    return createFailure(result.error ?? "Webhook停止に失敗しました");
  }

  await prisma.settings.update({
    where: { id: "singleton" },
    data: {
      googleCalendarWebhookChannelId: null,
      googleCalendarWebhookResourceId: null,
      googleCalendarWebhookExpiration: null,
    },
  });

  updateTag(CACHE_TAGS.SETTINGS);

  return createSuccess("Webhookを停止しました");
});

/**
 * 手動で同期を実行
 */
export const triggerManualSync = withPermission<
  [],
  { processed: number; deleted: number; updated: number; errors: string[] }
>(
  "settings",
  "update",
)(async () => {
  const result = await syncFromCalendar();

  updateTag(CACHE_TAGS.SETTINGS);
  updateTag(CACHE_TAGS.RESERVATIONS);

  return createSuccess("同期が完了しました", {
    processed: result.processed,
    deleted: result.deleted,
    updated: result.updated,
    errors: result.errors,
  });
});
