import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import type { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { ConnectionStatus } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import { getGoogleCalendarWebhookState } from "@/shared/domain/settings/admin-queries";
import { getServiceAccountClient } from "@/shared/domain/settings/google-calendar";
import { encrypt } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import {
  logError,
  ErrorCategory,
  ErrorSeverity,
} from "@/shared/lib/errors/server";
import { stopWebhookWatch } from "@/shared/lib/google-calendar";
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

  const trimmedCalendarId = data.googleCalendarId?.trim() ?? "";
  if (trimmedCalendarId !== "") {
    if (!isValidCalendarId(trimmedCalendarId)) {
      throw new DomainError("カレンダーIDの形式が無効です", "VALIDATION");
    }
    updateData.googleCalendarId = trimmedCalendarId;
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

  if (data.googleCalendarEnabled) {
    const existing = await prisma.settingsGoogleCalendar.findUnique({
      where: { id: "singleton" },
      select: {
        googleCalendarId: true,
        googleCalendarServiceAccountJson: true,
      },
    });
    const nextCalendarId =
      updateData.googleCalendarId ?? existing?.googleCalendarId ?? null;
    const nextServiceAccount =
      updateData.googleCalendarServiceAccountJson ??
      existing?.googleCalendarServiceAccountJson ??
      null;
    if (!nextCalendarId || !nextServiceAccount) {
      throw new DomainError(
        "Google Calendarを有効にするにはカレンダーIDとサービスアカウントが必要です",
        "VALIDATION",
      );
    }
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
      googleCalendarConnectionStatus: ConnectionStatus.CONNECTED,
    },
    update: {
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: ConnectionStatus.CONNECTED,
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
      googleCalendarConnectionStatus: ConnectionStatus.ERROR,
    },
    update: {
      googleCalendarLastTestedAt: testedAt,
      googleCalendarConnectionStatus: ConnectionStatus.ERROR,
    },
  });
}

export async function clearGoogleCalendarServiceAccount(): Promise<void> {
  const webhookState = await getGoogleCalendarWebhookState();
  if (webhookState.channelId && webhookState.resourceId) {
    // 資格情報が失われた後は二度と stop できないため、クリア前にベストエフォートで解除する。
    // 失敗してもクリア自体はブロックしない（SwitchBot deleteWebhook と同じ）。
    const client = await getServiceAccountClient({
      ignoreEnabledToggle: true,
    });
    if (client) {
      const result = await stopWebhookWatch(
        client,
        webhookState.channelId,
        webhookState.resourceId,
      );
      if (!result.success) {
        logError(new Error("Google Calendar webhook解除に失敗しました"), {
          category: ErrorCategory.EXTERNAL_API,
          severity: ErrorSeverity.MEDIUM,
          context: {
            operation: "clearGoogleCalendarServiceAccount",
            message: result.error,
          },
        });
      }
    }
  }

  await clearGoogleCalendarWebhook();

  await prisma.settingsGoogleCalendar.upsert({
    where: { id: "singleton" },
    create: {
      id: "singleton",
      googleCalendarEnabled: false,
      googleCalendarTwoWaySyncEnabled: false,
      googleCalendarServiceAccountJson: null,
      googleCalendarConnectionStatus: null,
      googleCalendarLastTestedAt: null,
    },
    update: {
      googleCalendarEnabled: false,
      googleCalendarTwoWaySyncEnabled: false,
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
