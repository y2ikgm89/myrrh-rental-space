import "server-only";

import { randomBytes } from "node:crypto";
import { prisma } from "@/shared/db/prisma";
import type { CalendarSyncMethod } from "@generated/prisma/enums";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import { encrypt } from "@/shared/lib/crypto";
import { encryptServiceAccountJson } from "@/shared/lib/google-calendar/service-account";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type StripeSettingsInput = {
  stripeEnabled: boolean;
  stripeTestMode: boolean;
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
  pollingIntervalMin: number;
};

export type GoogleCalendarWebhookInput = {
  channelId: string;
  resourceId: string;
  expiration: Date | undefined;
};

export type ICalTokenCreateInput = {
  name: string;
  spaceId: string | null;
  expiresInDays: number | null;
  createdBy: string;
};

export type ICalFeedSettingsInput = {
  icalFeedEnabled: boolean;
  icalFeedIncludeCustomerInfo: boolean;
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
  const updateData: Record<string, unknown> = {
    stripeEnabled: data.stripeEnabled,
    stripeTestMode: data.stripeTestMode,
    stripePublishableKey: data.stripePublishableKey || null,
    stripeCurrency: data.stripeCurrency,
  };

  if (data.stripeSecretKey) {
    try {
      updateData["stripeSecretKey"] = encrypt(data.stripeSecretKey);
    } catch {
      throw new DomainError(
        "シークレットキーの暗号化に失敗しました。ENCRYPTION_KEYが設定されていることを確認してください。",
        "VALIDATION",
      );
    }
  }

  if (data.stripeWebhookSecret) {
    try {
      updateData["stripeWebhookSecret"] = encrypt(data.stripeWebhookSecret);
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
  const updateData: Record<string, unknown> = {
    googleCalendarEnabled: data.googleCalendarEnabled,
    googleCalendarId: normalizeNullableString(data.googleCalendarId),
    icalAttachmentEnabled: data.icalAttachmentEnabled,
    addToCalendarLinksEnabled: data.addToCalendarLinksEnabled,
    googleCalendarMeetEnabled: data.googleCalendarMeetEnabled,
    googleCalendarReminderMinutes: data.googleCalendarReminderMinutes,
  };

  if (data.serviceAccountJson) {
    if (!parseGoogleServiceAccountCredentials(data.serviceAccountJson)) {
      throw new DomainError(
        "サービスアカウントJSONの形式が無効です",
        "VALIDATION",
      );
    }

    updateData["googleCalendarServiceAccountJson"] = encryptServiceAccountJson(
      data.serviceAccountJson,
    );
    updateData["googleCalendarConnectionStatus"] = null;
    updateData["googleCalendarLastTestedAt"] = null;
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
      googleCalendarPollingIntervalMin: data.pollingIntervalMin,
    },
    update: {
      googleCalendarTwoWaySyncEnabled: data.enabled,
      googleCalendarSyncMethod: data.syncMethod,
      googleCalendarPollingIntervalMin: data.pollingIntervalMin,
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

// ---------------------------------------------------------------------------
// iCal commands
// ---------------------------------------------------------------------------

export async function createICalToken(
  data: ICalTokenCreateInput,
): Promise<{ id: string; token: string }> {
  if (data.spaceId) {
    const space = await prisma.space.findUnique({
      where: { id: data.spaceId },
      select: { id: true },
    });

    if (!space) {
      throw new DomainError("スペースが見つかりません", "VALIDATION");
    }
  }

  const token = randomBytes(32).toString("base64url");
  const expiresAt =
    data.expiresInDays && data.expiresInDays > 0
      ? new Date(Date.now() + data.expiresInDays * 24 * 60 * 60 * 1000)
      : null;

  const created = await prisma.iCalToken.create({
    data: {
      token,
      name: data.name,
      spaceId: data.spaceId,
      createdBy: data.createdBy,
      expiresAt,
    },
    select: {
      id: true,
      token: true,
    },
  });

  return created;
}

export async function deleteICalToken(id: string): Promise<void> {
  const token = await prisma.iCalToken.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!token) {
    throw new DomainError("トークンが見つかりません", "NOT_FOUND");
  }

  await prisma.iCalToken.delete({ where: { id } });
}

export async function updateICalFeedSettings(
  data: ICalFeedSettingsInput,
): Promise<void> {
  await prisma.settings.upsert({
    where: { id: "singleton" },
    create: { id: "singleton", ...data },
    update: data,
  });
}
