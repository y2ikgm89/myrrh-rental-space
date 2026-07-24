import { beforeEach, describe, expect, mock, test } from "bun:test";

const singletonTimestamps = {
  id: "singleton",
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

const mockSettingsUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    featureModules: {},
    googleCalendarSyncMethod: "webhook",
    googleCalendarWebhookChannelId: "channel-secret",
    googleCalendarWebhookResourceId: "resource-secret",
    googleCalendarWebhookToken: "token-secret",
    googleCalendarWebhookExpiration: new Date("2026-02-01T00:00:00Z"),
    googleCalendarServiceAccountJson: "encrypted-service-account-json",
    stripeSecretKey: "encrypted-stripe-secret",
    stripeWebhookSecret: "encrypted-stripe-webhook-secret",
    resendApiKey: "encrypted-resend-api-key",
    turnstileSecretKey: "encrypted-turnstile-secret-key",
    googleMapsApiKey: "encrypted-google-maps-api-key",
    customApiKeys: {
      external: {
        key: "encrypted-custom-key",
        value: "encrypted-custom-value",
      },
    },
    instagramAccessToken: "encrypted-instagram-access-token",
    googleCalendarSyncToken: "calendar-sync-token",
    eventImportSyncToken: "event-import-sync-token",
  }),
);

const mockCarouselUpsert = mock(() =>
  Promise.resolve({
    ...singletonTimestamps,
    animation: "fade",
    duration: 5000,
    autoPlay: true,
    pauseOnHover: true,
    showArrows: true,
    showIndicator: true,
    designStyle: "solid",
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
    headerScrollBehavior: "always_visible",
    headerBackgroundMode: "solid",
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
    regularHolidays: null,
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
    discountCombinationMode: "best",
    showOriginalPrice: true,
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "tax_included",
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

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      upsert: mockSettingsUpsert,
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
  },
}));

mock.module("@generated/prisma/enums", () => ({
  CalendarSyncMethod: {
    polling: "polling",
    webhook: "webhook",
    both: "both",
  },
  DiscountCombinationMode: {
    best: "best",
    both: "both",
  },
  TaxDisplayMode: {
    tax_included: "tax_included",
    tax_excluded: "tax_excluded",
    both: "both",
  },
}));

mock.module("@/shared/lib/crypto", () => ({
  safeDecrypt: mock(() => "decrypted-secret"),
  safeDecryptToString: mock(() => "decrypted-secret"),
}));

mock.module("@/shared/lib/google-calendar/service-account", () => ({
  extractServiceAccountEmail: mock(() => "svc@example.iam.gserviceaccount.com"),
}));

import { getAdminSettings } from "@/shared/domain/settings/admin-queries";

describe("getAdminSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockClear();
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
  });

  test("client DTO does not serialize integration secrets or webhook verifiers", async () => {
    const settings = await getAdminSettings();

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
  });
});
