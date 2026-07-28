import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import type { CalendarSyncMethod } from "@/shared/lib/validations/enums/prisma-types";
import { DomainError } from "@/shared/domain/domain-error";
import {
  SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE,
  toExpectedUpdatedAt,
} from "@/shared/domain/settings/commands";
import { omitUndefined } from "@/shared/lib/serialize";
import { encrypt, safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { encryptServiceAccountJson } from "@/shared/lib/google-calendar/service-account";
import { isValidCalendarId } from "@/shared/lib/google-calendar/settings";
import { keysHaveMatchingMode } from "@/shared/lib/stripe-shared";
import { parseGoogleServiceAccountCredentials } from "@/shared/lib/validations/google-service-account";

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

export type StripeSettingsInput = {
  stripePublishableKey?: string | null | undefined;
  stripeSecretKey?: string | null | undefined;
  stripeWebhookSecret?: string | null | undefined;
  stripeCurrency: string;
  stripePaymentMethodTypes: readonly string[];
  /** 楽観的 concurrency: 読み込み時の SettingsStripe.updatedAt */
  expectedUpdatedAt: string | Date;
};

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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Stripe commands
// ---------------------------------------------------------------------------

export async function updateStripeSettings(
  data: StripeSettingsInput,
): Promise<void> {
  const expectedUpdatedAt = toExpectedUpdatedAt(data.expectedUpdatedAt);

  const existing = await prisma.settingsStripe.findUnique({
    where: { id: "singleton" },
    select: {
      stripePublishableKey: true,
      stripeSecretKey: true,
    },
  });

  const existingSecretDecrypted = existing?.stripeSecretKey
    ? safeDecryptToString(existing.stripeSecretKey, {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
      })
    : null;

  const finalPublishableKey =
    data.stripePublishableKey ?? existing?.stripePublishableKey ?? null;
  const finalSecretKey =
    data.stripeSecretKey ?? existingSecretDecrypted ?? null;

  if (finalPublishableKey && finalSecretKey) {
    if (!keysHaveMatchingMode(finalPublishableKey, finalSecretKey)) {
      throw new DomainError(
        "公開可能キーとシークレットキーのモード（test/live）が一致していません",
        "VALIDATION",
      );
    }
  }

  const updateData: Omit<Prisma.SettingsStripeCreateInput, "id"> = {
    stripeCurrency: data.stripeCurrency,
    stripePaymentMethodTypes: Array.from(data.stripePaymentMethodTypes),
  };

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

  await prisma.$transaction(async (tx) => {
    await tx.settingsStripe.upsert({
      where: { id: "singleton" },
      update: {},
      create: { id: "singleton" },
    });
    const result = await tx.settingsStripe.updateMany({
      where: { id: "singleton", updatedAt: expectedUpdatedAt },
      data: updateData,
    });
    if (result.count === 0) {
      throw new DomainError(SETTINGS_OPTIMISTIC_CONFLICT_MESSAGE, "CONFLICT");
    }
  });
}

export async function recordStripeConnectionSuccess(
  accountId: string | undefined,
): Promise<void> {
  await prisma.settingsStripe.upsert({
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
  await prisma.settingsStripe.upsert({
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
