import { beforeEach, describe, expect, mock, test } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

const singletonTimestamps = {
  id: "singleton",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const mockSettingsFeaturesUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    featureModules: {},
  }),
);

const mockStripeUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    stripePublishableKey: null,
    stripeSecretKey: "encrypted-stripe-secret",
    stripeWebhookSecret: "encrypted-stripe-webhook-secret",
    stripeAccountId: null,
    stripeCurrency: "jpy",
    stripePaymentMethodTypes: ["card"],
    stripeLastTestedAt: null,
    stripeConnectionStatus: null,
  }),
);

const mockGoogleCalendarUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    googleCalendarEnabled: false,
    googleCalendarServiceAccountJson: "encrypted-service-account-json",
    googleCalendarId: null,
    googleCalendarLastTestedAt: null,
    googleCalendarConnectionStatus: null,
    googleCalendarReminderMinutes: null,
    icalAttachmentEnabled: true,
    addToCalendarLinksEnabled: true,
    googleCalendarTwoWaySyncEnabled: false,
    googleCalendarSyncMethod: "WEBHOOK",
    googleCalendarSyncToken: "calendar-sync-token",
    googleCalendarLastSyncedAt: null,
    eventImportEnabled: false,
    eventImportSyncToken: "event-import-sync-token",
    googleCalendarWebhookChannelId: "channel-secret",
    googleCalendarWebhookResourceId: "resource-secret",
    googleCalendarWebhookExpiration: new Date("2026-02-01T00:00:00Z"),
    googleCalendarWebhookToken: "token-secret",
  }),
);

const mockGoogleBusinessProfileUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    googleBusinessProfileEnabled: false,
    googleBusinessProfileAuth: null,
  }),
);

const mockResendUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    resendApiKey: "encrypted-resend-api-key",
    resendWebhookSecret: null,
    resendLastTestedAt: null,
    resendConnectionStatus: null,
  }),
);

const mockTurnstileUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    turnstileSiteKey: null,
    turnstileSecretKey: "encrypted-turnstile-secret-key",
    turnstileLastTestedAt: null,
    turnstileConnectionStatus: null,
  }),
);

const mockGoogleMapsUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    googleMapsApiKey: "encrypted-google-maps-api-key",
    googleMapsLastTestedAt: null,
    googleMapsConnectionStatus: null,
  }),
);

const mockInstagramUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    instagramAccessToken: "encrypted-instagram-access-token",
    instagramTokenExpiresAt: null,
    instagramUserId: null,
    instagramUsername: null,
    instagramAccountType: null,
  }),
);

const mockSwitchbotUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    switchbotEnabled: false,
    switchbotOpenToken: null,
    switchbotSecretKey: null,
    switchbotConnectionStatus: null,
    switchbotLastTestedAt: null,
    switchbotPasscodeBufferMinutes: 15,
    switchbotWebhookPathToken: null,
  }),
);

const mockCarouselUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    animation: "FADE",
    duration: 5000,
    autoPlay: true,
    pauseOnHover: true,
    showArrows: true,
    showIndicator: true,
    designStyle: "SOLID",
    bgColor: null,
    textColor: null,
    stripeColor: null,
    stripeAnimation: false,
    gradientAnimation: false,
    glassAnimation: false,
    sticky: false,
  }),
);

const mockSystemUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    maintenanceMode: false,
    maintenanceMessage: null,
    cookieConsentEnabled: false,
    cookieConsentMessage: null,
    cookieConsentAcceptText: null,
    cookieConsentRejectText: null,
    cookieConsentPolicyUrl: null,
  }),
);

const mockSeoUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    siteName: "Myrrh",
    siteDescription: null,
    faviconUrl: "",
    defaultOgpImageUrl: null,
    headerLogoUrl: null,
    footerLogoUrl: null,
    footerCopyright: null,
    useHeaderLogo: true,
    useFooterLogo: true,
    defaultMetaDescription: null,
    defaultMetaKeywords: null,
    defaultOgpTitle: null,
    defaultOgpDescription: null,
  }),
);

const mockAnalyticsUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    analyticsType: null,
    googleAnalyticsId: null,
    googleTagManagerId: null,
    googleSearchConsoleId: null,
    bingWebmasterToolsId: null,
    gaPropertyId: null,
    microsoftClarityId: null,
  }),
);

const mockLayoutUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    containerWidth: null,
    containerWidthCustom: null,
    contentWidth: null,
    contentWidthCustom: null,
    headerScrollBehavior: "ALWAYS_VISIBLE",
    headerBackgroundMode: "SOLID",
    themeColor: "#fafafa",
    footerTagline: null,
    footerNavigationLabel: "Navigation",
    footerContactLabel: "Contact",
    footerHoursLabel: "Hours",
    footerShowSocialLinks: true,
  }),
);

const mockSidebarUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    sidebarEnabled: true,
    sidebarWidgets: [],
    sidebarRecentCount: 5,
    sidebarPopularCount: 5,
    sidebarTocEnabled: true,
  }),
);

const mockOrganizationUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    businessName: null,
    businessNameKana: null,
    representativeName: null,
    establishedDate: null,
    registrationNumber: null,
    invoiceNumber: null,
    businessDescription: null,
    phoneNumber: null,
    faxNumber: null,
    email: null,
    postalCode: null,
    prefecture: null,
    city: null,
    streetAddress: null,
    buildingName: null,
    businessHours: null,
    holidayNotice: null,
    senderEmail: null,
    senderName: null,
    replyToEmail: null,
  }),
);

const mockCommerceUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    durationDiscountEnabled: false,
    durationDiscountRules: [],
    discountCombinationMode: "BEST",
    showOriginalPrice: true,
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "TAX_INCLUDED",
    refundPolicy: null,
  }),
);

const mockNotificationUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    notifyNewReservation: true,
    notifyReservationChange: true,
    notifyReservationCancel: true,
    notifyNewInquiry: true,
    notifyInquiryCustomerReply: true,
    notifyEventRegistration: true,
    notifyEventWaitlistRegistration: true,
    notifyEventCancellation: true,
    notifyEventReminder: false,
    notificationStaffIds: [],
    notificationEmailAddresses: [],
  }),
);

const mockReservationUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
    sendReservationConfirmationEmail: true,
    maxRecurrenceInstances: 26,
    customerCanCancelSeriesInFull: false,
    cancellationDeadlineHours: 24,
    modificationDeadlineHours: 24,
  }),
);

const mockDataRetentionUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    dataRetention: {
      sessionMonths: 6,
      verificationMonths: 6,
      reservationGuestMonths: 12,
      inquiryMonths: 36,
      customerInactiveMonths: 84,
    },
  }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsFeatures: {
      upsert: mockSettingsFeaturesUpsert,
    },
    settingsAnnouncementCarousel: {
      upsert: mockCarouselUpsert,
    },
    settingsSystem: {
      upsert: mockSystemUpsert,
    },
    settingsSeo: {
      upsert: mockSeoUpsert,
    },
    settingsAnalytics: {
      upsert: mockAnalyticsUpsert,
    },
    settingsLayout: {
      upsert: mockLayoutUpsert,
    },
    settingsSidebar: {
      upsert: mockSidebarUpsert,
    },
    settingsOrganization: {
      upsert: mockOrganizationUpsert,
    },
    settingsCommerce: {
      upsert: mockCommerceUpsert,
    },
    settingsNotification: {
      upsert: mockNotificationUpsert,
    },
    settingsReservation: {
      upsert: mockReservationUpsert,
    },
    settingsDataRetention: {
      upsert: mockDataRetentionUpsert,
    },
    settingsStripe: {
      upsert: mockStripeUpsert,
    },
    settingsResend: {
      upsert: mockResendUpsert,
    },
    settingsTurnstile: {
      upsert: mockTurnstileUpsert,
    },
    settingsGoogleMaps: {
      upsert: mockGoogleMapsUpsert,
    },
    settingsGoogleCalendar: {
      upsert: mockGoogleCalendarUpsert,
    },
    settingsGoogleBusinessProfile: {
      upsert: mockGoogleBusinessProfileUpsert,
    },
    settingsInstagram: {
      upsert: mockInstagramUpsert,
    },
    settingsSwitchbot: {
      upsert: mockSwitchbotUpsert,
    },
  },
}));

await installPrismaEnumsMock({
  CalendarSyncMethod: {
    POLLING: "POLLING",
    WEBHOOK: "WEBHOOK",
    BOTH: "BOTH",
  },
  DiscountCombinationMode: {
    BEST: "BEST",
    BOTH: "BOTH",
  },
  TaxDisplayMode: {
    TAX_INCLUDED: "TAX_INCLUDED",
    TAX_EXCLUDED: "TAX_EXCLUDED",
    BOTH: "BOTH",
  },
});

mock.module("@/shared/lib/crypto", () => ({
  safeDecrypt: mock(() => "decrypted-secret"),
  safeDecryptToString: mock(() => "decrypted-secret"),
}));

import { getAdminSettings } from "@/shared/domain/settings/admin-queries";

describe("getAdminSettings", () => {
  beforeEach(() => {
    mockSettingsFeaturesUpsert.mockClear();
    mockCarouselUpsert.mockClear();
    mockSystemUpsert.mockClear();
    mockSeoUpsert.mockClear();
    mockAnalyticsUpsert.mockClear();
    mockLayoutUpsert.mockClear();
    mockSidebarUpsert.mockClear();
    mockOrganizationUpsert.mockClear();
    mockCommerceUpsert.mockClear();
    mockNotificationUpsert.mockClear();
    mockReservationUpsert.mockClear();
    mockDataRetentionUpsert.mockClear();
    mockStripeUpsert.mockClear();
    mockResendUpsert.mockClear();
    mockTurnstileUpsert.mockClear();
    mockGoogleMapsUpsert.mockClear();
    mockGoogleCalendarUpsert.mockClear();
    mockGoogleBusinessProfileUpsert.mockClear();
    mockInstagramUpsert.mockClear();
    mockSwitchbotUpsert.mockClear();
  });

  test("client DTO does not serialize integration secrets or webhook verifiers", async () => {
    const settings = await getAdminSettings();

    expect(mockResendUpsert).not.toHaveBeenCalled();
    expect(mockTurnstileUpsert).not.toHaveBeenCalled();
    expect(mockGoogleMapsUpsert).not.toHaveBeenCalled();
    expect(mockInstagramUpsert).not.toHaveBeenCalled();
    expect(mockSwitchbotUpsert).not.toHaveBeenCalled();
    expect(mockDataRetentionUpsert).not.toHaveBeenCalled();

    expect("stripeSecretKey" in settings).toBe(false);
    expect("stripeWebhookSecret" in settings).toBe(false);
    expect("googleCalendarServiceAccountJson" in settings).toBe(false);
    expect("googleCalendarWebhookChannelId" in settings).toBe(false);
    expect("googleCalendarWebhookResourceId" in settings).toBe(false);
    expect("googleCalendarWebhookToken" in settings).toBe(false);
    expect("resendApiKey" in settings).toBe(false);
    expect("turnstileSecretKey" in settings).toBe(false);
    expect("googleMapsApiKey" in settings).toBe(false);
    expect("customApiKeys" in settings).toBe(false);
    expect("instagramAccessToken" in settings).toBe(false);
    expect("googleCalendarSyncToken" in settings).toBe(false);
    expect("eventImportSyncToken" in settings).toBe(false);
    expect(settings.googleCalendarWebhookActive).toBe(true);
    expect(settings.googleCalendarWebhookExpiration).toBe(
      "2026-02-01T00:00:00.000Z",
    );
    expect(settings.googleCalendarServiceAccountConfigured).toBe(true);
    expect(settings.googleCalendarServiceAccountEmailMasked).toBeNull();
  });
});
