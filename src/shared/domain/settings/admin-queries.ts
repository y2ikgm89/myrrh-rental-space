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
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
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
import { parseRefundPolicy } from "@/shared/domain/refund/policy";
import type { RefundPolicy } from "@/shared/domain/refund/policy";
import { ensureSettingsAnnouncementCarousel } from "@/shared/domain/settings/announcement-bar";
import {
  ensureSettingsAnalytics,
  ensureSettingsCommerce,
  ensureSettingsLayout,
  ensureSettingsNotification,
  ensureSettingsOrganization,
  ensureSettingsReservation,
  ensureSettingsSeo,
  ensureSettingsSidebar,
  ensureSettingsSystem,
} from "@/shared/domain/settings/commands";
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

async function getOrCreateSettingsBundle() {
  const [
    settings,
    carousel,
    system,
    seo,
    analytics,
    layout,
    sidebar,
    organization,
    commerce,
    notification,
    reservation,
  ] = await Promise.all([
    getOrCreateSettings(),
    ensureSettingsAnnouncementCarousel(),
    ensureSettingsSystem(),
    ensureSettingsSeo(),
    ensureSettingsAnalytics(),
    ensureSettingsLayout(),
    ensureSettingsSidebar(),
    ensureSettingsOrganization(),
    ensureSettingsCommerce(),
    ensureSettingsNotification(),
    ensureSettingsReservation(),
  ]);

  return {
    settings,
    carousel,
    system,
    seo,
    analytics,
    layout,
    sidebar,
    organization,
    commerce,
    notification,
    reservation,
  };
}

function toSettingsData(
  settings: Awaited<ReturnType<typeof getOrCreateSettings>>,
  carousel: Awaited<ReturnType<typeof ensureSettingsAnnouncementCarousel>>,
  system: Awaited<ReturnType<typeof ensureSettingsSystem>>,
  seo: Awaited<ReturnType<typeof ensureSettingsSeo>>,
  analytics: Awaited<ReturnType<typeof ensureSettingsAnalytics>>,
  layout: Awaited<ReturnType<typeof ensureSettingsLayout>>,
  sidebar: Awaited<ReturnType<typeof ensureSettingsSidebar>>,
  organization: Awaited<ReturnType<typeof ensureSettingsOrganization>>,
  commerce: Awaited<ReturnType<typeof ensureSettingsCommerce>>,
  notification: Awaited<ReturnType<typeof ensureSettingsNotification>>,
  reservation: Awaited<ReturnType<typeof ensureSettingsReservation>>,
  options: {
    stripeSecretKeyMasked: string | null;
    stripeWebhookSecretMasked: string | null;
    googleCalendarServiceAccountEmailMasked: string | null;
  },
): Serialized<SettingsData> {
  return toPlainObject({
    id: settings.id,
    siteName: seo.siteName,
    siteDescription: seo.siteDescription,
    faviconUrl: seo.faviconUrl,
    defaultOgpImageUrl: seo.defaultOgpImageUrl,
    headerLogoUrl: seo.headerLogoUrl,
    footerLogoUrl: seo.footerLogoUrl,
    footerCopyright: seo.footerCopyright,
    useHeaderLogo: seo.useHeaderLogo,
    useFooterLogo: seo.useFooterLogo,
    businessName: organization.businessName,
    businessNameKana: organization.businessNameKana,
    representativeName: organization.representativeName,
    establishedDate: organization.establishedDate,
    registrationNumber: organization.registrationNumber,
    invoiceNumber: organization.invoiceNumber,
    businessDescription: organization.businessDescription,
    phoneNumber: organization.phoneNumber,
    faxNumber: organization.faxNumber,
    email: organization.email,
    postalCode: organization.postalCode,
    prefecture: organization.prefecture,
    city: organization.city,
    streetAddress: organization.streetAddress,
    buildingName: organization.buildingName,
    businessHours: parseBusinessHours(organization.businessHours),
    regularHolidays: parseStringArrayOrNull(organization.regularHolidays),
    holidayNotice: organization.holidayNotice,
    senderEmail: organization.senderEmail,
    senderName: organization.senderName,
    replyToEmail: organization.replyToEmail,
    defaultMetaDescription: seo.defaultMetaDescription,
    defaultMetaKeywords: seo.defaultMetaKeywords,
    defaultOgpTitle: seo.defaultOgpTitle,
    defaultOgpDescription: seo.defaultOgpDescription,
    analyticsType: analytics.analyticsType,
    googleAnalyticsId: analytics.googleAnalyticsId,
    googleTagManagerId: analytics.googleTagManagerId,
    googleSearchConsoleId: analytics.googleSearchConsoleId,
    bingWebmasterToolsId: analytics.bingWebmasterToolsId,
    gaPropertyId: analytics.gaPropertyId,
    microsoftClarityId: analytics.microsoftClarityId,
    defaultTimeSlot: reservation.defaultTimeSlot,
    minReservationDuration: reservation.minReservationDuration,
    maxReservationDuration: reservation.maxReservationDuration,
    cancellationDeadlineHours: reservation.cancellationDeadlineHours,
    modificationDeadlineHours: reservation.modificationDeadlineHours,
    customerCanCancelSeriesInFull: reservation.customerCanCancelSeriesInFull,
    sendReservationConfirmationEmail:
      reservation.sendReservationConfirmationEmail,
    notifyNewReservation: notification.notifyNewReservation,
    notifyReservationChange: notification.notifyReservationChange,
    notifyReservationCancel: notification.notifyReservationCancel,
    notifyNewInquiry: notification.notifyNewInquiry,
    notifyEventRegistration: notification.notifyEventRegistration,
    notifyEventWaitlistRegistration:
      notification.notifyEventWaitlistRegistration,
    notifyEventCancellation: notification.notifyEventCancellation,
    notifyEventReminder: notification.notifyEventReminder,
    notificationStaffIds: notification.notificationStaffIds,
    notificationEmailAddresses: notification.notificationEmailAddresses,
    taxStandardRate: commerce.taxStandardRate,
    taxReducedRate: commerce.taxReducedRate,
    taxDisplayModePublic: commerce.taxDisplayModePublic,
    maintenanceMode: system.maintenanceMode,
    maintenanceMessage: system.maintenanceMessage,
    stripePublishableKey: settings.stripePublishableKey,
    stripeAccountId: settings.stripeAccountId,
    stripeCurrency: settings.stripeCurrency,
    stripePaymentMethodTypes: settings.stripePaymentMethodTypes,
    stripeLastTestedAt: settings.stripeLastTestedAt,
    stripeConnectionStatus: settings.stripeConnectionStatus,
    cookieConsentEnabled: system.cookieConsentEnabled,
    cookieConsentMessage: system.cookieConsentMessage,
    cookieConsentAcceptText: system.cookieConsentAcceptText,
    cookieConsentRejectText: system.cookieConsentRejectText,
    cookieConsentPolicyUrl: system.cookieConsentPolicyUrl,
    announcementBarAnimation: carousel.animation,
    announcementBarDuration: carousel.duration,
    announcementBarAutoPlay: carousel.autoPlay,
    announcementBarPauseOnHover: carousel.pauseOnHover,
    announcementBarShowArrows: carousel.showArrows,
    announcementBarShowIndicator: carousel.showIndicator,
    announcementBarDesignStyle: carousel.designStyle,
    announcementBarBgColor: carousel.bgColor,
    announcementBarTextColor: carousel.textColor,
    announcementBarStripeColor: carousel.stripeColor,
    announcementBarStripeAnimation: carousel.stripeAnimation,
    announcementBarGradientAnimation: carousel.gradientAnimation,
    announcementBarGlassAnimation: carousel.glassAnimation,
    googleCalendarEnabled: settings.googleCalendarEnabled,
    googleCalendarId: settings.googleCalendarId,
    googleCalendarLastTestedAt: settings.googleCalendarLastTestedAt,
    googleCalendarConnectionStatus: settings.googleCalendarConnectionStatus,
    googleBusinessProfileEnabled: settings.googleBusinessProfileEnabled,
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
    containerWidth: layout.containerWidth,
    containerWidthCustom: layout.containerWidthCustom,
    contentWidth: layout.contentWidth,
    contentWidthCustom: layout.contentWidthCustom,
    sidebarEnabled: sidebar.sidebarEnabled,
    sidebarWidgets: sidebar.sidebarWidgets,
    sidebarRecentCount: sidebar.sidebarRecentCount,
    sidebarPopularCount: sidebar.sidebarPopularCount,
    sidebarTocEnabled: sidebar.sidebarTocEnabled,
    headerScrollBehavior: layout.headerScrollBehavior,
    headerBackgroundMode: layout.headerBackgroundMode,
    footerTagline: layout.footerTagline,
    footerNavigationLabel: layout.footerNavigationLabel,
    footerContactLabel: layout.footerContactLabel,
    footerHoursLabel: layout.footerHoursLabel,
    footerShowSocialLinks: layout.footerShowSocialLinks,
    eventImportEnabled: settings.eventImportEnabled,
    themeColor: layout.themeColor,
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
  const {
    settings,
    carousel,
    system,
    seo,
    analytics,
    layout,
    sidebar,
    organization,
    commerce,
    notification,
    reservation,
  } = await getOrCreateSettingsBundle();

  return toSettingsData(
    settings,
    carousel,
    system,
    seo,
    analytics,
    layout,
    sidebar,
    organization,
    commerce,
    notification,
    reservation,
    {
      stripeSecretKeyMasked: null,
      stripeWebhookSecretMasked: null,
      googleCalendarServiceAccountEmailMasked: null,
    },
  );
}

export async function getAdminSettings(): Promise<Serialized<SettingsData>> {
  const {
    settings,
    carousel,
    system,
    seo,
    analytics,
    layout,
    sidebar,
    organization,
    commerce,
    notification,
    reservation,
  } = await getOrCreateSettingsBundle();

  const stripeSecretKeyMasked = settings.stripeSecretKey
    ? maskSecretKey(
        safeDecryptToString(settings.stripeSecretKey, {
          expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
        }) || "****",
      )
    : null;
  const stripeWebhookSecretMasked = settings.stripeWebhookSecret
    ? maskSecretKey(
        safeDecryptToString(settings.stripeWebhookSecret, {
          expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
        }) || "****",
      )
    : null;

  let googleCalendarServiceAccountEmailMasked: string | null = null;
  if (settings.googleCalendarServiceAccountJson) {
    const decrypted = safeDecryptToString(
      settings.googleCalendarServiceAccountJson,
      {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
      },
    );
    if (decrypted) {
      const email = extractServiceAccountEmail(decrypted);
      if (email) {
        googleCalendarServiceAccountEmailMasked =
          maskServiceAccountEmail(email);
      }
    }
  }

  return toSettingsData(
    settings,
    carousel,
    system,
    seo,
    analytics,
    layout,
    sidebar,
    organization,
    commerce,
    notification,
    reservation,
    {
      stripeSecretKeyMasked,
      stripeWebhookSecretMasked,
      googleCalendarServiceAccountEmailMasked,
    },
  );
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData> {
  const settings = await prisma.settings.findUnique({
    where: { id: "singleton" },
    select: {
      googleCalendarEnabled: true,
      googleCalendarId: true,
      googleCalendarConnectionStatus: true,
      googleCalendarLastTestedAt: true,
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

  // Webhook トークンは encrypt-at-rest（SwitchBot webhook path token と同じ posture）。
  // 復号失敗（レガシー平文・破損・kid不一致など）は "有効なトークンが無い" 扱いにする:
  // route.ts の !settings.token 分岐で 503 になり、admin 側は webhook 未登録として表示される。
  // 再登録時に新値が encrypt-at-rest で書き直される（renewal cron / admin action）。
  const decryptedToken = safeDecryptToString(
    settings?.googleCalendarWebhookToken,
    {
      expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarWebhookToken,
    },
  );

  return {
    calendarId: settings?.googleCalendarId ?? null,
    channelId: settings?.googleCalendarWebhookChannelId ?? null,
    resourceId: settings?.googleCalendarWebhookResourceId ?? null,
    token: decryptedToken,
    expiration: settings?.googleCalendarWebhookExpiration ?? null,
  };
}

export async function getDiscountSettings(): Promise<DiscountSettingsData> {
  const settings = await prisma.settingsCommerce.findUnique({
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
  const settings = await prisma.settingsCommerce.findUnique({
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

/**
 * `SettingsCommerce.refundPolicy` を parse して RefundPolicy か null で返す。
 *
 * 未設定 (null) / shape 破損の両方を null に集約する fail-open 動作は
 * `parseRefundPolicy` に集約されている。UI 側は null を「policy 未設定 =
 * cancellation 時は残額全額返金」として表示する。
 */
export async function getRefundPolicySettings(): Promise<RefundPolicy | null> {
  const settings = await prisma.settingsCommerce.findUnique({
    where: { id: "singleton" },
    select: { refundPolicy: true },
  });

  if (!settings) return null;
  return parseRefundPolicy(settings.refundPolicy);
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
