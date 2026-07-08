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
import { toPlainObject } from "@/shared/lib/serialize";
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
    id: settings.id,
    siteName: settings.siteName,
    siteDescription: settings.siteDescription,
    faviconUrl: settings.faviconUrl,
    defaultOgpImageUrl: settings.defaultOgpImageUrl,
    headerLogoUrl: settings.headerLogoUrl,
    footerLogoUrl: settings.footerLogoUrl,
    footerCopyright: settings.footerCopyright,
    useHeaderLogo: settings.useHeaderLogo,
    useFooterLogo: settings.useFooterLogo,
    businessName: settings.businessName,
    businessNameKana: settings.businessNameKana,
    representativeName: settings.representativeName,
    establishedDate: settings.establishedDate,
    registrationNumber: settings.registrationNumber,
    invoiceNumber: settings.invoiceNumber,
    businessDescription: settings.businessDescription,
    phoneNumber: settings.phoneNumber,
    faxNumber: settings.faxNumber,
    email: settings.email,
    postalCode: settings.postalCode,
    prefecture: settings.prefecture,
    city: settings.city,
    streetAddress: settings.streetAddress,
    buildingName: settings.buildingName,
    businessHours: parseBusinessHours(settings.businessHours),
    regularHolidays: parseStringArrayOrNull(settings.regularHolidays),
    holidayNotice: settings.holidayNotice,
    senderEmail: settings.senderEmail,
    senderName: settings.senderName,
    replyToEmail: settings.replyToEmail,
    defaultMetaDescription: settings.defaultMetaDescription,
    defaultMetaKeywords: settings.defaultMetaKeywords,
    defaultOgpTitle: settings.defaultOgpTitle,
    defaultOgpDescription: settings.defaultOgpDescription,
    analyticsType: settings.analyticsType,
    googleAnalyticsId: settings.googleAnalyticsId,
    googleTagManagerId: settings.googleTagManagerId,
    googleSearchConsoleId: settings.googleSearchConsoleId,
    bingWebmasterToolsId: settings.bingWebmasterToolsId,
    gaPropertyId: settings.gaPropertyId,
    microsoftClarityId: settings.microsoftClarityId,
    defaultTimeSlot: settings.defaultTimeSlot,
    minReservationDuration: settings.minReservationDuration,
    maxReservationDuration: settings.maxReservationDuration,
    cancellationDeadlineHours: settings.cancellationDeadlineHours,
    modificationDeadlineHours: settings.modificationDeadlineHours,
    sendReservationConfirmationEmail: settings.sendReservationConfirmationEmail,
    notifyNewReservation: settings.notifyNewReservation,
    notifyReservationChange: settings.notifyReservationChange,
    notifyReservationCancel: settings.notifyReservationCancel,
    notifyNewInquiry: settings.notifyNewInquiry,
    notifyEventRegistration: settings.notifyEventRegistration,
    notifyEventCancellation: settings.notifyEventCancellation,
    notifyEventReminder: settings.notifyEventReminder,
    notificationStaffIds: settings.notificationStaffIds,
    notificationEmailAddresses: settings.notificationEmailAddresses,
    taxStandardRate: settings.taxStandardRate,
    taxReducedRate: settings.taxReducedRate,
    taxDisplayModePublic: settings.taxDisplayModePublic,
    maintenanceMode: settings.maintenanceMode,
    maintenanceMessage: settings.maintenanceMessage,
    stripeEnabled: settings.stripeEnabled,
    stripePublishableKey: settings.stripePublishableKey,
    stripeAccountId: settings.stripeAccountId,
    stripeCurrency: settings.stripeCurrency,
    stripeLastTestedAt: settings.stripeLastTestedAt,
    stripeConnectionStatus: settings.stripeConnectionStatus,
    cookieConsentEnabled: settings.cookieConsentEnabled,
    cookieConsentMessage: settings.cookieConsentMessage,
    cookieConsentAcceptText: settings.cookieConsentAcceptText,
    cookieConsentRejectText: settings.cookieConsentRejectText,
    cookieConsentPolicyUrl: settings.cookieConsentPolicyUrl,
    announcementBarAnimation: settings.announcementBarAnimation,
    announcementBarDuration: settings.announcementBarDuration,
    announcementBarAutoPlay: settings.announcementBarAutoPlay,
    announcementBarPauseOnHover: settings.announcementBarPauseOnHover,
    announcementBarShowArrows: settings.announcementBarShowArrows,
    announcementBarShowIndicator: settings.announcementBarShowIndicator,
    announcementBarDesignStyle: settings.announcementBarDesignStyle,
    announcementBarBgColor: settings.announcementBarBgColor,
    announcementBarTextColor: settings.announcementBarTextColor,
    announcementBarStripeColor: settings.announcementBarStripeColor,
    announcementBarStripeAnimation: settings.announcementBarStripeAnimation,
    announcementBarGradientAnimation: settings.announcementBarGradientAnimation,
    announcementBarGlassAnimation: settings.announcementBarGlassAnimation,
    googleCalendarEnabled: settings.googleCalendarEnabled,
    googleCalendarId: settings.googleCalendarId,
    googleCalendarLastTestedAt: settings.googleCalendarLastTestedAt,
    googleCalendarConnectionStatus: settings.googleCalendarConnectionStatus,
    googleBusinessProfileEnabled: settings.googleBusinessProfileEnabled,
    googleCalendarMeetEnabled: settings.googleCalendarMeetEnabled,
    googleCalendarReminderMinutes: settings.googleCalendarReminderMinutes,
    icalAttachmentEnabled: settings.icalAttachmentEnabled,
    addToCalendarLinksEnabled: settings.addToCalendarLinksEnabled,
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
    headerScrollBehavior: settings.headerScrollBehavior,
    headerBackgroundMode: settings.headerBackgroundMode,
    footerTagline: settings.footerTagline,
    footerNavigationLabel: settings.footerNavigationLabel,
    footerContactLabel: settings.footerContactLabel,
    footerHoursLabel: settings.footerHoursLabel,
    footerShowSocialLinks: settings.footerShowSocialLinks,
    eventImportEnabled: settings.eventImportEnabled,
    themeColor: settings.themeColor,
    createdAt: settings.createdAt,
    updatedAt: settings.updatedAt,
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

export async function getEventImportSettings(): Promise<{
  eventImportEnabled: boolean;
}> {
  const settings = await prisma.settings.findFirstOrThrow({
    where: { id: "singleton" },
    select: { eventImportEnabled: true },
  });

  return { eventImportEnabled: settings.eventImportEnabled };
}
