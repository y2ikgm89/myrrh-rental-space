import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockSettingsUpsert = mock(() =>
  Promise.resolve({
    id: "singleton",
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-02T00:00:00Z"),
    businessHours: null,
    regularHolidays: null,
    notificationStaffIds: [],
    featureModules: {},
    durationDiscountRules: [],
    discountCombinationMode: "best",
    showOriginalPrice: true,
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "tax_included",
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

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      upsert: mockSettingsUpsert,
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
}));

mock.module("@/shared/lib/google-calendar/service-account", () => ({
  extractServiceAccountEmail: mock(() => "svc@example.iam.gserviceaccount.com"),
}));

import { getAdminSettings } from "@/shared/domain/settings/admin-queries";

describe("getAdminSettings", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockClear();
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
