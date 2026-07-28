import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import type { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { encryptServiceAccountJson } from "@/shared/lib/google-calendar/service-account";
import { isValidCalendarId } from "@/shared/lib/google-calendar/settings";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

export type GoogleCalendarSettingsInput = {
  googleCalendarEnabled: boolean;
  googleCalendarId: string | null;
  serviceAccountJson: string | null;
  icalAttachmentEnabled: boolean;
  addToCalendarLinksEnabled: boolean;
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
  token: string;
};

export async function updateEventImportEnabled(
  enabled: boolean,
): Promise<void> {
  await prisma.settingsGoogleCalendar.update({
    where: { id: "singleton" },
    data: { eventImportEnabled: enabled },
  });
}

export async function updateGoogleCalendarSettings(
  data: GoogleCalendarSettingsInput,
): Promise<void> {
  const updateData: Omit<Prisma.SettingsGoogleCalendarCreateInput, "id"> = {
    googleCalendarEnabled: data.googleCalendarEnabled,
    icalAttachmentEnabled: data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: data.addToCalendarLinksEnabled,
    googleCalendarReminderMinutes: data.googleCalendarReminderMinutes,
  };

  if (data.googleCalendarId) {
    const trimmedCalendarId = data.googleCalendarId.trim();
    if (trimmedCalendarId !== "") {
      if (!isValidCalendarId(trimmedCalendarId)) {
        throw new DomainError("カレンダーIDの形式が無効です", "VALIDATION");
      }
      updateData.googleCalendarId = trimmedCalendarId;
    }
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

  await prisma.settingsGoogleCalendar.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...updateData },
    update: updateData,
  });
}

export async function recordGoogleCalendarConnectionSuccess(): Promise<void> {
  const testedAt = new Date();

  await prisma.settingsGoogleCalendar.upsert({
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

  await prisma.settingsGoogleCalendar.upsert({
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
  await prisma.settingsGoogleCalendar.upsert({
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
  await prisma.settingsGoogleCalendar.upsert({
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

export async function saveGoogleCalendarWebhook(
  data: GoogleCalendarWebhookInput,
): Promise<void> {
  let encryptedToken: string;
  try {
    encryptedToken = encrypt(data.token, {
      purpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarWebhookToken,
    });
  } catch {
    throw new DomainError(
      "Webhookトークンの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
      "VALIDATION",
    );
  }

  await prisma.settingsGoogleCalendar.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarWebhookChannelId: data.channelId,
      googleCalendarWebhookResourceId: data.resourceId,
      googleCalendarWebhookToken: encryptedToken,
      googleCalendarWebhookExpiration: data.expiration ?? null,
    },
    update: {
      googleCalendarWebhookChannelId: data.channelId,
      googleCalendarWebhookResourceId: data.resourceId,
      googleCalendarWebhookToken: encryptedToken,
      googleCalendarWebhookExpiration: data.expiration ?? null,
    },
  });
}

export async function clearGoogleCalendarWebhook(): Promise<void> {
  await prisma.settingsGoogleCalendar.upsert({
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
