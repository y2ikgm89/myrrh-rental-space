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

mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
}));

const mockServerEnv: Record<string, string | undefined> = {
  RESEND_API_KEY: undefined,
  STRIPE_SECRET_KEY: undefined,
  TURNSTILE_SECRET_KEY: undefined,
};

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
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

const { getIntegrationHealthSummary, getResendConfig, getTurnstileConfig } =
  await import("@/shared/domain/settings/api-key-queries");

describe("getIntegrationHealthSummary", () => {
  beforeEach(() => {
    mockServerEnv["RESEND_API_KEY"] = undefined;
    mockServerEnv["STRIPE_SECRET_KEY"] = undefined;
    mockServerEnv["TURNSTILE_SECRET_KEY"] = undefined;
    mockSettingsResendFindUnique.mockReset();
    mockSettingsResendFindUnique.mockResolvedValue(null);
    mockSettingsStripeFindUnique.mockReset();
    mockSettingsStripeFindUnique.mockResolvedValue(null);
    mockSettingsTurnstileFindUnique.mockReset();
    mockSettingsTurnstileFindUnique.mockResolvedValue(null);
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

describe("getResendConfig envFallbackActive", () => {
  beforeEach(() => {
    mockServerEnv["RESEND_API_KEY"] = undefined;
    mockSettingsResendFindUnique.mockReset();
    mockSettingsResendFindUnique.mockResolvedValue(null);
  });

  test("usable DB key が無く RESEND_API_KEY があるとき true", async () => {
    mockServerEnv["RESEND_API_KEY"] = "re_env_fallback_key";

    const config = await getResendConfig();
    expect(config.envFallbackActive).toBe(true);
  });

  test("usable DB key があるときは env があっても false", async () => {
    mockServerEnv["RESEND_API_KEY"] = "re_env_fallback_key";
    mockSettingsResendFindUnique.mockResolvedValue({
      resendApiKey: "re_db_usable_key_value",
      resendWebhookSecret: null,
      resendLastTestedAt: null,
      resendConnectionStatus: null,
    });

    const config = await getResendConfig();
    expect(config.envFallbackActive).toBe(false);
  });
});

describe("getTurnstileConfig envFallbackActive", () => {
  beforeEach(() => {
    mockServerEnv["TURNSTILE_SECRET_KEY"] = undefined;
    mockSettingsTurnstileFindUnique.mockReset();
    mockSettingsTurnstileFindUnique.mockResolvedValue(null);
  });

  test("usable DB secret が無く TURNSTILE_SECRET_KEY があるとき true", async () => {
    mockServerEnv["TURNSTILE_SECRET_KEY"] = "0xenv_secret_key";

    const config = await getTurnstileConfig();
    expect(config.envFallbackActive).toBe(true);
  });
});
