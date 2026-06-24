import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  CalendarSyncMethod,
  DiscountCombinationMode,
  TaxDisplayMode,
} from "@generated/prisma/enums";
import type {
  DiscountSettingsData,
  GoogleCalendarSettingsData,
  GoogleCalendarWebhookState,
  ICalFeedSettingsData,
  ICalTokenWithRelations,
  SettingsData,
  TaxSettings,
  TwoWaySyncSettingsData,
} from "@/shared/domain/settings/types";
import { safeDecrypt } from "@/shared/lib/crypto";
import { extractServiceAccountEmail } from "@/shared/lib/google-calendar/service-account";
import {
  parseBusinessHours,
  parseFeatureModules,
  parseStringArrayOrNull,
} from "@/shared/lib/json-validators";
import { DEFAULT_TAX_SETTINGS } from "@/shared/lib/pricing/tax";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
const DEFAULT_DISCOUNT_SETTINGS: DiscountSettingsData = {
  durationDiscountEnabled: false,
  durationDiscountRules: [],
  discountCombinationMode: DiscountCombinationMode.best,
  showOriginalPrice: true,
};

function maskSecretKey(key: string): string {
  if (!key || key.length < 16) {
    return "****";
  }
  if (!/^[a-zA-Z0-9_]+$/.test(key)) {
    return "****";
  }
  const prefix = key.substring(0, 12);
  const suffix = key.substring(key.length - 4);
  return `${prefix}...${suffix}`;
}

function maskServiceAccountEmail(email: string): string {
  const [localPart = "", domain = ""] = email.split("@");
  return `${localPart.slice(0, 3)}****@${domain}`;
}

async function getOrCreateSettings() {
  return prisma.settings.upsert({
    where: { id: "singleton" },
    update: {},
    create: { id: "singleton" },
  });
}

function toSettingsData(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
  options: {
    stripeSecretKeyMasked: string | null;
    stripeWebhookSecretMasked: string | null;
    googleCalendarServiceAccountEmailMasked: string | null;
  },
): Serialized<SettingsData> {
  return toPlainObject({
    ...settings,
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    notificationStaffIds:
      parseStringArrayOrNull(settings.notificationStaffIds) ?? [],
    featureModules: parseFeatureModules(settings.featureModules),
    stripeSecretKeyMasked: options.stripeSecretKeyMasked,
    stripeWebhookSecretMasked: options.stripeWebhookSecretMasked,
    googleCalendarServiceAccountEmailMasked:
      options.googleCalendarServiceAccountEmailMasked,
    googleCalendarTwoWaySyncEnabled: settings.googleCalendarTwoWaySyncEnabled,
    googleCalendarSyncMethod: settings.googleCalendarSyncMethod,
    googleCalendarLastSyncedAt: settings.googleCalendarLastSyncedAt,
    googleCalendarWebhookActive: !!settings.googleCalendarWebhookChannelId,
    googleCalendarWebhookExpiration: settings.googleCalendarWebhookExpiration,
    containerWidth: settings.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
    sidebarEnabled: settings.sidebarEnabled,
    sidebarWidgets: settings.sidebarWidgets,
    sidebarRecentCount: settings.sidebarRecentCount,
    sidebarPopularCount: settings.sidebarPopularCount,
    sidebarTocEnabled: settings.sidebarTocEnabled,
    taxStandardRate: settings.taxStandardRate,
    taxReducedRate: settings.taxReducedRate,
    taxDisplayModePublic: settings.taxDisplayModePublic,
  });
}

function parseTaxDisplayMode(value: string | null): TaxDisplayMode {
  if (
    value === TaxDisplayMode.tax_excluded ||
    value === TaxDisplayMode.tax_included ||
    value === TaxDisplayMode.both
  ) {
    return value;
  }
  return TaxDisplayMode.tax_included;
}

function parseCalendarConnectionStatus(
  value: string | null,
): "connected" | "error" | null {
  if (value === "connected" || value === "error") {
    return value;
  }

  return null;
}

function parseCalendarSyncMethod(value: string | null): CalendarSyncMethod {
  if (
    value === CalendarSyncMethod.polling ||
    value === CalendarSyncMethod.webhook ||
    value === CalendarSyncMethod.both
  ) {
    return value;
  }

  return CalendarSyncMethod.polling;
}

export async function getPublicSettings(): Promise<Serialized<SettingsData>> {
  const settings = await getOrCreateSettings();

  return toSettingsData(settings, {
    stripeSecretKeyMasked: null,
    stripeWebhookSecretMasked: null,
    googleCalendarServiceAccountEmailMasked: null,
  });
}

export async function getAdminSettings(): Promise<Serialized<SettingsData>> {
  const settings = await getOrCreateSettings();

  const stripeSecretKeyMasked = settings.stripeSecretKey
    ? maskSecretKey(safeDecrypt(settings.stripeSecretKey) || "****")
    : null;
  const stripeWebhookSecretMasked = settings.stripeWebhookSecret
    ? maskSecretKey(safeDecrypt(settings.stripeWebhookSecret) || "****")
    : null;

  let googleCalendarServiceAccountEmailMasked: string | null = null;
  if (settings.googleCalendarServiceAccountJson) {
    const decrypted = safeDecrypt(settings.googleCalendarServiceAccountJson);
    if (decrypted) {
      const email = extractServiceAccountEmail(decrypted);
      if (email) {
        googleCalendarServiceAccountEmailMasked =
          maskServiceAccountEmail(email);
      }
    }
  }

  return toSettingsData(settings, {
    stripeSecretKeyMasked,
    stripeWebhookSecretMasked,
    googleCalendarServiceAccountEmailMasked,
  });
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarEnabled: true,
      googleCalendarId: true,
      googleCalendarConnectionStatus: true,
      googleCalendarLastTestedAt: true,
      googleCalendarMeetEnabled: true,
      googleCalendarReminderMinutes: true,
    },
  });

  return {
    enabled: settings?.googleCalendarEnabled ?? false,
    calendarId: settings?.googleCalendarId ?? null,
    connectionStatus: parseCalendarConnectionStatus(
      settings?.googleCalendarConnectionStatus ?? null,
    ),
    lastTestedAt: settings?.googleCalendarLastTestedAt ?? null,
    meetEnabled: settings?.googleCalendarMeetEnabled ?? false,
    reminderMinutes: settings?.googleCalendarReminderMinutes ?? null,
  };
}

export async function getGoogleCalendarServiceAccountConfig(): Promise<{
  enabled: boolean;
  encryptedServiceAccountJson: string | null;
}> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarEnabled: true,
      googleCalendarServiceAccountJson: true,
    },
  });

  return {
    enabled: settings?.googleCalendarEnabled ?? false,
    encryptedServiceAccountJson:
      settings?.googleCalendarServiceAccountJson ?? null,
  };
}

export async function getTwoWaySyncSettings(): Promise<TwoWaySyncSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarTwoWaySyncEnabled: true,
      googleCalendarSyncMethod: true,
      googleCalendarLastSyncedAt: true,
      googleCalendarWebhookExpiration: true,
    },
  });

  return {
    enabled: settings?.googleCalendarTwoWaySyncEnabled ?? false,
    syncMethod: parseCalendarSyncMethod(
      settings?.googleCalendarSyncMethod ?? null,
    ),
    lastSyncedAt: settings?.googleCalendarLastSyncedAt ?? null,
    webhookExpiration: settings?.googleCalendarWebhookExpiration ?? null,
  };
}

export async function getGoogleCalendarWebhookState(): Promise<GoogleCalendarWebhookState> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarId: true,
      googleCalendarWebhookChannelId: true,
      googleCalendarWebhookResourceId: true,
      googleCalendarWebhookToken: true,
      googleCalendarWebhookExpiration: true,
    },
  });

  return {
    calendarId: settings?.googleCalendarId ?? null,
    channelId: settings?.googleCalendarWebhookChannelId ?? null,
    resourceId: settings?.googleCalendarWebhookResourceId ?? null,
    token: settings?.googleCalendarWebhookToken ?? null,
    expiration: settings?.googleCalendarWebhookExpiration ?? null,
  };
}

export async function getICalTokens(): Promise<
  Serialized<ICalTokenWithRelations>[]
> {
  const tokens = await prisma.iCalToken.findMany({
    select: {
      id: true,
      token: true,
      name: true,
      spaceId: true,
      createdBy: true,
      expiresAt: true,
      createdAt: true,
      lastUsedAt: true,
      space: { select: { name: true } },
      user: { select: { name: true } },
    },
    orderBy: { createdAt: "desc" },
  });

  return toPlainArray(
    tokens.map((token) => ({
      id: token.id,
      token: token.token,
      name: token.name,
      spaceId: token.spaceId,
      spaceName: token.space?.name ?? null,
      createdBy: token.createdBy,
      createdByName: token.user.name,
      expiresAt: token.expiresAt,
      createdAt: token.createdAt,
      lastUsedAt: token.lastUsedAt,
    })),
  );
}

export async function getICalFeedSettings(): Promise<ICalFeedSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      icalFeedEnabled: true,
      icalFeedIncludeCustomerInfo: true,
    },
  });

  return {
    icalFeedEnabled: settings?.icalFeedEnabled ?? false,
    icalFeedIncludeCustomerInfo: settings?.icalFeedIncludeCustomerInfo ?? false,
  };
}

export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      durationDiscountEnabled: true,
      durationDiscountRules: true,
      discountCombinationMode: true,
      showOriginalPrice: true,
    },
  });

  if (!settings) {
    return DEFAULT_DISCOUNT_SETTINGS;
  }

  return {
    durationDiscountEnabled: settings.durationDiscountEnabled,
    durationDiscountRules: parseDurationDiscountRules(
      settings.durationDiscountRules,
    ),
    discountCombinationMode: getValidDiscountCombinationMode(
      settings.discountCombinationMode,
    ),
    showOriginalPrice: settings.showOriginalPrice,
  };
}

export async function getTaxSettings(): Promise<TaxSettings> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      taxStandardRate: true,
      taxReducedRate: true,
      taxDisplayModePublic: true,
    },
  });

  if (!settings) {
    return DEFAULT_TAX_SETTINGS;
  }

  return {
    standardRate: settings.taxStandardRate,
    reducedRate: settings.taxReducedRate,
    displayModePublic: parseTaxDisplayMode(settings.taxDisplayModePublic),
  };
}

export async function getPublicTaxSettings(): Promise<TaxSettings> {
  return getTaxSettings();
}

export async function getEventImportSettings(): Promise<{
  eventImportEnabled: boolean;
}> {
  const settings = await prisma.settings.findFirstOrThrow({
    where: { id: "singleton" },
    select: { eventImportEnabled: true },
  });

  return { eventImportEnabled: settings.eventImportEnabled };
}
