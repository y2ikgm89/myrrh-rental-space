import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import type { CalendarSyncMethod } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import { encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { encryptServiceAccountJson } from "@/shared/lib/google-calendar/service-account";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type StripeSettingsInput = {
  stripeEnabled: boolean;
  stripePublishableKey?: string | null | undefined;
  stripeSecretKey?: string | null | undefined;
  stripeWebhookSecret?: string | null | undefined;
  stripeCurrency: string;
};

export type GoogleCalendarSettingsInput = {
  googleCalendarEnabled: boolean;
  googleCalendarId: string | null;
  serviceAccountJson: string | null;
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
  googleCalendarMeetEnabled: boolean;
  /** null = Google Calendar 既定を使う, 0 = 通知なし, N = N分前にメール通知 */
  googleCalendarReminderMinutes: number | null;
};

export type TwoWaySyncSettingsInput = {
  enabled: boolean;
  syncMethod: CalendarSyncMethod;
};

export type GoogleCalendarWebhookInput = {
  channelId: string;
  resourceId: string;
  expiration: Date | undefined;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function normalizeNullableString(value: string | null): string | null {
  return value || null;
}

// ---------------------------------------------------------------------------
// Stripe commands
// ---------------------------------------------------------------------------

export async function updateStripeSettings(
  data: StripeSettingsInput,
): Promise<void> {
  const updateData: Omit<Prisma.SettingsCreateInput, "id"> = {
    stripeEnabled: data.stripeEnabled,
    stripeCurrency: data.stripeCurrency,
  };

  // 公開可能キーは管理 UI で「変更」ボタンによりロックされる公開キー。ロック中の保存は
  // 空送信になるため、空（falsy）は「既存値を維持」として扱う（シークレットキーと同じ意味論）。
  // クリアは clearStripeKeys（「キーをクリア」ボタン）経由で行う。
  if (data.stripePublishableKey) {
    updateData.stripePublishableKey = data.stripePublishableKey;
  }

  if (data.stripeSecretKey) {
    try {
      updateData.stripeSecretKey = encrypt(data.stripeSecretKey, {
        purpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      });
    } catch {
      throw new DomainError(
        "シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  if (data.stripeWebhookSecret) {
    try {
      updateData.stripeWebhookSecret = encrypt(data.stripeWebhookSecret, {
        purpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
      });
    } catch {
      throw new DomainError(
        "Webhookシークレットの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function recordStripeConnectionSuccess(
  accountId: string | undefined,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: omitUndefined({
      id: "singleton",
      stripeLastTestedAt: new Date(),
      stripeConnectionStatus: "connected",
      stripeAccountId: accountId,
    }),
    update: omitUndefined({
      stripeLastTestedAt: new Date(),
      stripeConnectionStatus: "connected",
      stripeAccountId: accountId,
    }),
  });
}

export async function clearStripeKeys(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
    update: {
      stripeSecretKey: null,
      stripeWebhookSecret: null,
      stripePublishableKey: null,
      stripeAccountId: null,
      stripeConnectionStatus: null,
      stripeLastTestedAt: null,
    },
  });
}

// ---------------------------------------------------------------------------
// Google Calendar commands
// ---------------------------------------------------------------------------

export async function updateGoogleCalendarSettings(
  data: GoogleCalendarSettingsInput,
): Promise<void> {
  const updateData: Omit<Prisma.SettingsCreateInput, "id"> = {
    googleCalendarEnabled: data.googleCalendarEnabled,
    icalAttachmentEnabled: data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: data.addToCalendarLinksEnabled,
    googleCalendarMeetEnabled: data.googleCalendarMeetEnabled,
    googleCalendarReminderMinutes: data.googleCalendarReminderMinutes,
  };

  // カレンダーID は管理 UI で「変更」ボタンによりロックされる公開識別子。ロック中の保存は
  // 空送信になるため、空（falsy）は「既存値を維持」として扱う（サービスアカウントと同じ意味論）。
  if (data.googleCalendarId) {
    updateData.googleCalendarId = normalizeNullableString(
      data.googleCalendarId,
    );
  }

  if (data.serviceAccountJson) {
    if (!parseGoogleServiceAccountCredentials(data.serviceAccountJson)) {
      throw new DomainError(
        "サービスアカウントJSONの形式が無効です",
        "VALIDATION",
      );
    }

    updateData.googleCalendarServiceAccountJson = encryptServiceAccountJson(
      data.serviceAccountJson,
    );
    updateData.googleCalendarConnectionStatus = null;
    updateData.googleCalendarLastTestedAt = null;
  }

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function recordGoogleCalendarConnectionSuccess(): Promise<void> {
  const testedAt = new Date();

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "connected",
    },
    update: {
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "connected",
    },
  });
}

export async function recordGoogleCalendarConnectionError(): Promise<void> {
  const testedAt = new Date();

  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "error",
    },
    update: {
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: "error",
    },
  });
}

export async function clearGoogleCalendarServiceAccount(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
    update: {
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
  });
}

export async function updateTwoWaySyncSettings(
  data: TwoWaySyncSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarTwoWaySyncEnabled: data.enabled,
      googleCalendarSyncMethod: data.syncMethod,
    },
    update: {
      googleCalendarTwoWaySyncEnabled: data.enabled,
      googleCalendarSyncMethod: data.syncMethod,
    },
  });
}

export async function saveGoogleCalendarWebhookToken(
  token: string,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", googleCalendarWebhookToken: token },
    update: { googleCalendarWebhookToken: token },
  });
}

export async function saveGoogleCalendarWebhook(
  data: GoogleCalendarWebhookInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarWebhookChannelId: data.channelId,
      googleCalendarWebhookResourceId: data.resourceId,
      googleCalendarWebhookExpiration: data.expiration ?? null,
    },
    update: {
      googleCalendarWebhookChannelId: data.channelId,
      googleCalendarWebhookResourceId: data.resourceId,
      googleCalendarWebhookExpiration: data.expiration ?? null,
    },
  });
}

export async function clearGoogleCalendarWebhook(): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarWebhookChannelId: null,
      googleCalendarWebhookResourceId: null,
      googleCalendarWebhookToken: null,
      googleCalendarWebhookExpiration: null,
    },
    update: {
      googleCalendarWebhookChannelId: null,
      googleCalendarWebhookResourceId: null,
      googleCalendarWebhookToken: null,
      googleCalendarWebhookExpiration: null,
    },
  });
}
