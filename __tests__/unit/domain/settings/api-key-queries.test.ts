import { beforeEach, describe, expect, mock, test } from "bun:test";

const mockSettingsResendFindUnique = mock(() => Promise.resolve(null));
const mockSettingsStripeFindUnique = mock<
  () => Promise<{
    stripeSecretKey: string | null;
    stripeWebhookSecret: string | null;
  } | null>
>(() => Promise.resolve(null));
const mockSettingsGoogleCalendarFindUnique = mock(() => Promise.resolve(null));
const mockSettingsTurnstileFindUnique = mock(() => Promise.resolve(null));
const mockSettingsSwitchbotFindUnique = mock(() => Promise.resolve(null));

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: {
    RESEND_API_KEY: undefined,
    STRIPE_SECRET_KEY: undefined,
    TURNSTILE_SECRET_KEY: undefined,
  },
}));

mock.module("@/shared/lib/crypto", () => ({
  safeDecryptToString: (value: string | null | undefined) => value ?? null,
}));

mock.module("@/shared/lib/crypto-purposes", () => ({
  SETTINGS_CRYPTO_PURPOSES: {
    resendApiKey: "resend-api-key",
    stripeSecretKey: "stripe-secret-key",
    turnstileSecretKey: "turnstile-secret-key",
    switchbotOpenToken: "switchbot-open-token",
    switchbotSecretKey: "switchbot-secret-key",
  },
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsResend: { findUnique: mockSettingsResendFindUnique },
    settingsStripe: { findUnique: mockSettingsStripeFindUnique },
    settingsGoogleCalendar: {
      findUnique: mockSettingsGoogleCalendarFindUnique,
    },
    settingsTurnstile: { findUnique: mockSettingsTurnstileFindUnique },
    settingsSwitchbot: { findUnique: mockSettingsSwitchbotFindUnique },
  },
}));

const { getIntegrationHealthSummary } =
  await import("@/shared/domain/settings/api-key-queries");

describe("getIntegrationHealthSummary", () => {
  beforeEach(() => {
    mockSettingsStripeFindUnique.mockReset();
    mockSettingsStripeFindUnique.mockResolvedValue(null);
  });

  test("stripe secret のみでは health=false（webhook secret 必須）", async () => {
    mockSettingsStripeFindUnique.mockResolvedValueOnce({
      stripeSecretKey: "enc:sk_test_abc",
      stripeWebhookSecret: null,
    });

    const health = await getIntegrationHealthSummary();
    expect(health.stripe).toBe(false);
  });

  test("stripe secret + webhook secret ciphertext で health=true", async () => {
    mockSettingsStripeFindUnique.mockResolvedValueOnce({
      stripeSecretKey: "enc:sk_test_abc",
      stripeWebhookSecret: "enc:whsec_test",
    });

    const health = await getIntegrationHealthSummary();
    expect(health.stripe).toBe(true);
  });
});
