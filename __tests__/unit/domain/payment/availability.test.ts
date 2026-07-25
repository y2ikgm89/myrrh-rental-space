import { beforeEach, describe, expect, mock, test } from "bun:test";
import { DomainError } from "@/shared/domain/domain-error";

const mockGetStripeSettings = mock<
  () => Promise<{
    stripePublishableKey: string | null;
    stripeAccountId: string | null;
    stripeCurrency: string;
    stripePaymentMethodTypes: string[];
  } | null>
>(async () => ({
  stripePublishableKey: "pk_test_public",
  stripeAccountId: "acct_123",
  stripeCurrency: "jpy",
  stripePaymentMethodTypes: ["card"],
}));

const mockGetStripeCredentialCiphertext = mock<
  () => Promise<{
    stripeSecretKey: string | null;
    stripeWebhookSecret: string | null;
  } | null>
>(async () => ({
  stripeSecretKey: "enc-sk",
  stripeWebhookSecret: "enc-whsec",
}));

const mockIsFeatureEnabled = mock<(feature: string) => Promise<boolean>>(
  async () => true,
);

const mockServerEnv: { STRIPE_SECRET_KEY?: string | undefined } = {};

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/settings/queries/integration", () => ({
  getStripeSettings: () => mockGetStripeSettings(),
  getStripeCredentialCiphertext: () => mockGetStripeCredentialCiphertext(),
}));

mock.module("@/shared/lib/features/check", () => ({
  isFeatureEnabled: (feature: string) => mockIsFeatureEnabled(feature),
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
}));

const { assertOnlinePaymentAvailable, assertStripeCredentialsConfigured } =
  await import("@/shared/domain/payment/availability");

function resetMocks() {
  mockGetStripeSettings.mockClear();
  mockGetStripeCredentialCiphertext.mockClear();
  mockIsFeatureEnabled.mockClear();
  mockServerEnv.STRIPE_SECRET_KEY = undefined;
  mockIsFeatureEnabled.mockImplementation(async () => true);
  mockGetStripeSettings.mockImplementation(async () => ({
    stripePublishableKey: "pk_test_public",
    stripeAccountId: "acct_123",
    stripeCurrency: "jpy",
    stripePaymentMethodTypes: ["card"],
  }));
  mockGetStripeCredentialCiphertext.mockImplementation(async () => ({
    stripeSecretKey: "enc-sk",
    stripeWebhookSecret: "enc-whsec",
  }));
}

describe("payment availability gates", () => {
  beforeEach(() => {
    resetMocks();
  });

  test("assertOnlinePaymentAvailable throws when payment feature is OFF", async () => {
    mockIsFeatureEnabled.mockImplementation(async () => false);

    await expect(assertOnlinePaymentAvailable()).rejects.toMatchObject({
      message: "オンライン決済機能が無効になっています",
      code: "VALIDATION",
    } satisfies Partial<DomainError>);
    expect(mockGetStripeSettings).not.toHaveBeenCalled();
    expect(mockGetStripeCredentialCiphertext).not.toHaveBeenCalled();
  });

  test("assertStripeCredentialsConfigured succeeds when feature OFF but credentials present", async () => {
    mockIsFeatureEnabled.mockImplementation(async () => false);

    const result = await assertStripeCredentialsConfigured();

    expect(result).toEqual({
      stripeSecretKey: "enc-sk",
      stripeWebhookSecret: "enc-whsec",
      stripePublishableKey: "pk_test_public",
      stripeAccountId: "acct_123",
      stripeCurrency: "jpy",
      stripePaymentMethodTypes: ["card"],
    });
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
    expect(mockGetStripeSettings).toHaveBeenCalledTimes(1);
    expect(mockGetStripeCredentialCiphertext).toHaveBeenCalledTimes(1);
  });

  test("assertOnlinePaymentAvailable throws when credentials are missing", async () => {
    mockGetStripeCredentialCiphertext.mockImplementation(async () => ({
      stripeSecretKey: null,
      stripeWebhookSecret: "enc-whsec",
    }));

    await expect(assertOnlinePaymentAvailable()).rejects.toMatchObject({
      code: "VALIDATION",
      message:
        "Stripe の設定が正しくありません。管理者にお問い合わせください。",
    } satisfies Partial<DomainError>);
  });

  test("assertStripeCredentialsConfigured throws when credentials are missing", async () => {
    mockGetStripeCredentialCiphertext.mockImplementation(async () => ({
      stripeSecretKey: "enc-sk",
      stripeWebhookSecret: null,
    }));

    await expect(assertStripeCredentialsConfigured()).rejects.toMatchObject({
      code: "VALIDATION",
      message:
        "Stripe の設定が正しくありません。管理者にお問い合わせください。",
    } satisfies Partial<DomainError>);
  });

  test("DB secret 欠損でも env STRIPE_SECRET_KEY があれば通過する", async () => {
    mockGetStripeCredentialCiphertext.mockImplementation(async () => ({
      stripeSecretKey: null,
      stripeWebhookSecret: "enc-whsec",
    }));
    mockServerEnv.STRIPE_SECRET_KEY = "sk_test_env";

    const result = await assertOnlinePaymentAvailable();

    expect(result.stripeSecretKey).toBeNull();
    expect(result.stripeWebhookSecret).toBe("enc-whsec");
    expect(result.stripePublishableKey).toBe("pk_test_public");
  });

  test("assertOnlinePaymentAvailable returns credentials when feature ON and configured", async () => {
    const result = await assertOnlinePaymentAvailable();

    expect(result.stripeSecretKey).toBe("enc-sk");
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith("payment");
    expect(mockGetStripeCredentialCiphertext).toHaveBeenCalledTimes(1);
  });
});
