import "server-only";

import { prisma } from "@/shared/db/prisma";
import {
  CalendarSyncMethod,
  DiscountCombinationMode,
  TaxDisplayMode,
  ConnectionStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import type {
  AdminTaxSettings,
  DiscountSettingsData,
  GoogleCalendarSettingsData,
  GoogleCalendarWebhookState,
  RefundPolicySettingsData,
  SettingsData,
  TwoWaySyncSettingsData,
} from "@/shared/domain/settings/types";
import { safeDecryptToString } from "@/shared/lib/crypto";
import { SETTINGS_CRYPTO_PURPOSES } from "@/shared/lib/crypto-purposes";
import { extractGoogleServiceAccountEmail } from "@/shared/lib/validations/google-service-account";
import {
  parseBusinessHours,
  parseDataRetentionConfig,
  parseFeatureModules,
} from "@/shared/lib/json-validators";
import type { DataRetentionConfig } from "@/shared/lib/json-validators";
import { parseDurationDiscountRules } from "@/shared/lib/pricing/discount";
import { toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import { getValidDiscountCombinationMode } from "@/shared/lib/validations/enums/helpers";
import { resolveRefundPolicy } from "@/shared/domain/refund/policy";
import { serverEnv } from "@/shared/lib/env/server";
import { isTestKey } from "@/shared/lib/stripe-shared";
import { ensureSettingsAnnouncementCarousel } from "@/shared/domain/settings/announcement-bar";
import {
  ensureSettingsAnalytics,
  ensureSettingsCommerce,
  ensureSettingsDataRetention,
  ensureSettingsFeatures,
  ensureSettingsGoogleBusinessProfile,
  ensureSettingsGoogleCalendar,
  ensureSettingsLayout,
  ensureSettingsNotification,
  ensureSettingsOrganization,
  ensureSettingsReservation,
  ensureSettingsSeo,
  ensureSettingsSidebar,
  ensureSettingsStripe,
  ensureSettingsSystem,
} from "@/shared/domain/settings/ensure-commands";
const DEFAULT_DISCOUNT_SETTINGS = {
  durationDiscountEnabled: false,
  durationDiscountRules: [],
  discountCombinationMode: DiscountCombinationMode.BEST,
  showOriginalPrice: true,
} satisfies Omit<DiscountSettingsData, "commerceUpdatedAt">;

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

async function getOrCreateSettingsBundle() {
  const [
    features,
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
    stripe,
    googleCalendar,
    googleBusinessProfile,
  ] = await Promise.all([
    ensureSettingsFeatures(),
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
    ensureSettingsStripe(),
    ensureSettingsGoogleCalendar(),
    ensureSettingsGoogleBusinessProfile(),
  ]);

  return {
    features,
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
    stripe,
    googleCalendar,
    googleBusinessProfile,
  };
}

function toSettingsData(
  features: Awaited<ReturnType<typeof ensureSettingsFeatures>>,
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
  stripe: Awaited<ReturnType<typeof ensureSettingsStripe>>,
  googleCalendar: Awaited<ReturnType<typeof ensureSettingsGoogleCalendar>>,
  googleBusinessProfile: Awaited<
    ReturnType<typeof ensureSettingsGoogleBusinessProfile>
  >,
  options: {
    stripeSecretKeyMasked: string | null;
    stripeWebhookSecretMasked: string | null;
    googleCalendarServiceAccountEmailMasked: string | null;
    googleCalendarServiceAccountConfigured: boolean;
  },
): Serialized<SettingsData> {
  return toPlainObject({
    id: features.id,
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
    holidayNotice: organization.holidayNotice,
    organizationUpdatedAt: organization.updatedAt,
    reservationUpdatedAt: reservation.updatedAt,
    layoutUpdatedAt: layout.updatedAt,
    sidebarUpdatedAt: sidebar.updatedAt,
    notificationUpdatedAt: notification.updatedAt,
    featuresUpdatedAt: features.updatedAt,
    stripeUpdatedAt: stripe.updatedAt,
    commerceUpdatedAt: commerce.updatedAt,
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
    maxRecurrenceInstances: reservation.maxRecurrenceInstances,
    sendReservationConfirmationEmail:
      reservation.sendReservationConfirmationEmail,
    notifyNewReservation: notification.notifyNewReservation,
    notifyReservationChange: notification.notifyReservationChange,
    notifyReservationCancel: notification.notifyReservationCancel,
    notifyNewInquiry: notification.notifyNewInquiry,
    notifyInquiryCustomerReply: notification.notifyInquiryCustomerReply,
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
    stripePublishableKey: stripe.stripePublishableKey,
    stripeAccountId: stripe.stripeAccountId,
    stripeCurrency: stripe.stripeCurrency,
    stripePaymentMethodTypes: stripe.stripePaymentMethodTypes,
    stripeLastTestedAt: stripe.stripeLastTestedAt,
    stripeConnectionStatus: stripe.stripeConnectionStatus,
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
    googleCalendarEnabled: googleCalendar.googleCalendarEnabled,
    googleCalendarId: googleCalendar.googleCalendarId,
    googleCalendarLastTestedAt: googleCalendar.googleCalendarLastTestedAt,
    googleCalendarConnectionStatus:
      googleCalendar.googleCalendarConnectionStatus,
    googleBusinessProfileEnabled:
      googleBusinessProfile.googleBusinessProfileEnabled,
    googleCalendarReminderMinutes: googleCalendar.googleCalendarReminderMinutes,
    icalAttachmentEnabled: googleCalendar.icalAttachmentEnabled,
    addToCalendarLinksEnabled: googleCalendar.addToCalendarLinksEnabled,
    featureModules: parseFeatureModules(features.featureModules),
    stripeSecretKeyMasked: options.stripeSecretKeyMasked,
    stripeWebhookSecretMasked: options.stripeWebhookSecretMasked,
    googleCalendarServiceAccountEmailMasked:
      options.googleCalendarServiceAccountEmailMasked,
    googleCalendarServiceAccountConfigured:
      options.googleCalendarServiceAccountConfigured,
    googleCalendarTwoWaySyncEnabled:
      googleCalendar.googleCalendarTwoWaySyncEnabled,
    googleCalendarSyncMethod: googleCalendar.googleCalendarSyncMethod,
    googleCalendarLastSyncedAt: googleCalendar.googleCalendarLastSyncedAt,
    googleCalendarWebhookActive:
      !!googleCalendar.googleCalendarWebhookChannelId,
    googleCalendarWebhookExpiration:
      googleCalendar.googleCalendarWebhookExpiration,
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
    eventImportEnabled: googleCalendar.eventImportEnabled,
    themeColor: layout.themeColor,
    createdAt: features.createdAt,
    updatedAt: features.updatedAt,
  });
}

function parseTaxDisplayMode(value: string | null): TaxDisplayMode {
  if (
    value === TaxDisplayMode.TAX_EXCLUDED ||
    value === TaxDisplayMode.TAX_INCLUDED ||
    value === TaxDisplayMode.BOTH
  ) {
    return value;
  }
  return TaxDisplayMode.TAX_INCLUDED;
}

/**
 * DB の `connection_status` 列を型付き値へ narrow する。
 *
 * **引数を `string` にしてはいけない。** enum 化で値を大文字へ寄せたとき、
 * ここが `value === "connected"` のままだったため型検査を素通りし、
 * `isGoogleCalendarEnabled()` が常に false を返して**カレンダー連携が無言で止まる**
 * ところだった（`string` と文字列リテラルの比較は合法なので tsc は何も言わない）。
 * 引数を enum で受ければ、値域が動いたときに必ずここが落ちる。
 */
function parseCalendarConnectionStatus(
  value: ConnectionStatus | null,
): ConnectionStatus | null {
  if (
    value === ConnectionStatus.CONNECTED ||
    value === ConnectionStatus.ERROR
  ) {
    return value;
  }

  return null;
}

function parseCalendarSyncMethod(value: string | null): CalendarSyncMethod {
  if (
    value === CalendarSyncMethod.POLLING ||
    value === CalendarSyncMethod.WEBHOOK ||
    value === CalendarSyncMethod.BOTH
  ) {
    return value;
  }

  return CalendarSyncMethod.POLLING;
}

export async function getPublicSettings(): Promise<Serialized<SettingsData>> {
  const {
    features,
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
    stripe,
    googleCalendar,
    googleBusinessProfile,
  } = await getOrCreateSettingsBundle();

  return toSettingsData(
    features,
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
    stripe,
    googleCalendar,
    googleBusinessProfile,
    {
      stripeSecretKeyMasked: null,
      stripeWebhookSecretMasked: null,
      googleCalendarServiceAccountEmailMasked: null,
      googleCalendarServiceAccountConfigured: false,
    },
  );
}

export async function getAdminSettings(): Promise<Serialized<SettingsData>> {
  const {
    features,
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
    stripe,
    googleCalendar,
    googleBusinessProfile,
  } = await getOrCreateSettingsBundle();

  const stripeSecretKeyMasked = stripe.stripeSecretKey
    ? maskSecretKey(
        safeDecryptToString(stripe.stripeSecretKey, {
          expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeSecretKey,
        }) || "****",
      )
    : null;
  const stripeWebhookSecretMasked = stripe.stripeWebhookSecret
    ? maskSecretKey(
        safeDecryptToString(stripe.stripeWebhookSecret, {
          expectedPurpose: SETTINGS_CRYPTO_PURPOSES.stripeWebhookSecret,
        }) || "****",
      )
    : null;

  let googleCalendarServiceAccountEmailMasked: string | null = null;
  if (googleCalendar.googleCalendarServiceAccountJson) {
    const decrypted = safeDecryptToString(
      googleCalendar.googleCalendarServiceAccountJson,
      {
        expectedPurpose: SETTINGS_CRYPTO_PURPOSES.googleCalendarServiceAccount,
      },
    );
    if (decrypted) {
      const email = extractGoogleServiceAccountEmail(decrypted);
      if (email) {
        googleCalendarServiceAccountEmailMasked =
          maskServiceAccountEmail(email);
      }
    }
  }

  return toSettingsData(
    features,
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
    stripe,
    googleCalendar,
    googleBusinessProfile,
    {
      stripeSecretKeyMasked,
      stripeWebhookSecretMasked,
      googleCalendarServiceAccountEmailMasked,
      googleCalendarServiceAccountConfigured: Boolean(
        googleCalendar.googleCalendarServiceAccountJson,
      ),
    },
  );
}

export async function getGoogleCalendarSettings(): Promise<GoogleCalendarSettingsData> {
  const settings = await prisma.settingsGoogleCalendar.findUnique({
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
  const settings = await prisma.settingsGoogleCalendar.findUnique({
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
  const settings = await prisma.settingsGoogleCalendar.findUnique({
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
  const settings = await prisma.settingsGoogleCalendar.findUnique({
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
  const settings = await ensureSettingsCommerce();

  return {
    ...DEFAULT_DISCOUNT_SETTINGS,
    durationDiscountEnabled: settings.durationDiscountEnabled,
    durationDiscountRules: parseDurationDiscountRules(
      settings.durationDiscountRules,
    ),
    discountCombinationMode: getValidDiscountCombinationMode(
      settings.discountCombinationMode,
    ),
    showOriginalPrice: settings.showOriginalPrice,
    commerceUpdatedAt: settings.updatedAt,
  };
}

export async function getTaxSettings(): Promise<AdminTaxSettings> {
  const settings = await ensureSettingsCommerce();

  return {
    standardRate: settings.taxStandardRate,
    reducedRate: settings.taxReducedRate,
    displayModePublic: parseTaxDisplayMode(settings.taxDisplayModePublic),
    commerceUpdatedAt: settings.updatedAt,
  };
}

/**
 * `SettingsCommerce.refundPolicy` を解決して返す。
 *
 * - `unset` — 意図的未設定（キャンセル時は残額全額の自動返金）
 * - `invalid` — JSON 破損（自動返金 fail-closed。管理 UI で検知）
 * - `configured` — 有効な tier policy
 */
export async function getRefundPolicySettings(): Promise<RefundPolicySettingsData> {
  const settings = await ensureSettingsCommerce();

  return {
    resolution: resolveRefundPolicy(settings.refundPolicy),
    commerceUpdatedAt: settings.updatedAt,
  };
}

/** DB に Stripe シークレットがなく env `STRIPE_SECRET_KEY` のみ有効な場合 true */
export async function getStripeEnvSecretOverrideActive(): Promise<boolean> {
  const stripe = await prisma.settingsStripe.findUnique({
    where: { id: "singleton" },
    select: { stripeSecretKey: true },
  });
  return Boolean(serverEnv.STRIPE_SECRET_KEY) && !stripe?.stripeSecretKey;
}

export async function getEventImportSettings(): Promise<{
  eventImportEnabled: boolean;
}> {
  const settings = await prisma.settingsGoogleCalendar.findFirstOrThrow({
    where: { id: "singleton" },
    select: { eventImportEnabled: true },
  });

  return { eventImportEnabled: settings.eventImportEnabled };
}

export type DataRetentionSettingsData = {
  config: DataRetentionConfig;
  /** SettingsDataRetention.updatedAt — 保持月数設定の optimistic concurrency 用 */
  dataRetentionUpdatedAt: Date;
};

export async function getDataRetentionSettings(): Promise<DataRetentionSettingsData> {
  const row = await ensureSettingsDataRetention();
  return {
    config: parseDataRetentionConfig(row.dataRetention),
    dataRetentionUpdatedAt: row.updatedAt,
  };
}

export type StripeSettingsAuditSnapshot = {
  stripePublishableKeyLast4: string | null;
  stripeMode: "test" | "live" | null;
  stripeCurrency: string;
  stripePaymentMethodTypes: readonly string[];
  stripeSecretKeyConfigured: boolean;
  stripeWebhookSecretConfigured: boolean;
};

type StripeAuditRow = {
  stripePublishableKey: string | null;
  stripeSecretKey: string | null;
  stripeWebhookSecret: string | null;
  stripeCurrency: string;
  stripePaymentMethodTypes: string[];
};

export function buildStripeSettingsAuditSnapshot(
  stripe: StripeAuditRow | null,
): StripeSettingsAuditSnapshot {
  const publishableKey = stripe?.stripePublishableKey ?? null;
  return {
    stripePublishableKeyLast4:
      publishableKey && publishableKey.length >= 4
        ? publishableKey.slice(-4)
        : publishableKey,
    stripeMode: publishableKey
      ? isTestKey(publishableKey)
        ? "test"
        : "live"
      : null,
    stripeCurrency: stripe?.stripeCurrency ?? "jpy",
    stripePaymentMethodTypes: stripe?.stripePaymentMethodTypes ?? ["card"],
    stripeSecretKeyConfigured: Boolean(stripe?.stripeSecretKey),
    stripeWebhookSecretConfigured: Boolean(stripe?.stripeWebhookSecret),
  };
}

export async function getStripeSettingsAuditSnapshot(): Promise<StripeSettingsAuditSnapshot> {
  const stripe = await prisma.settingsStripe.findUnique({
    where: { id: "singleton" },
    select: {
      stripePublishableKey: true,
      stripeSecretKey: true,
      stripeWebhookSecret: true,
      stripeCurrency: true,
      stripePaymentMethodTypes: true,
    },
  });
  return buildStripeSettingsAuditSnapshot(stripe);
}
