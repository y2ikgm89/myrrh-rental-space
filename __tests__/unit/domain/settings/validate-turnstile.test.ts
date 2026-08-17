import { afterEach, describe, expect, mock, test } from "bun:test";
import { TURNSTILE_ACTIONS } from "@/shared/lib/turnstile-actions";
import type { TurnstileVerifyContext } from "@/shared/lib/turnstile";

mock.module("server-only", () => ({}));

const mockServerEnv: Record<string, string | undefined> = {
  NODE_ENV: "test",
  TURNSTILE_SECRET_KEY: undefined,
};
const mockClientEnv: Record<string, string | undefined> = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined,
};

const mockGetDecryptedTurnstileSecretKey = mock(() =>
  Promise.resolve<string | null>(null),
);
const mockGetTurnstileConfig = mock(() =>
  Promise.resolve({
    siteKey: null as string | null,
    secretKeyMasked: null as string | null,
    lastTestedAt: null as Date | null,
    connectionStatus: null as string | null,
    envFallbackActive: false,
  }),
);

const mockVerifyTurnstileTokenLib = mock(
  (
    _context: TurnstileVerifyContext,
    _params: {
      token: string;
      expectedAction: string;
      remoteip?: string;
    },
  ) => Promise.resolve({ success: true as const }),
);

mock.module("next/headers", () => ({
  headers: mock(() => new Headers({ host: "localhost:3000" })),
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
  isLocalhostUrl: () => false,
}));

mock.module("@/shared/lib/env/client", () => ({
  clientEnv: mockClientEnv,
}));

mock.module("@/shared/lib/e2e-runtime", () => ({
  isE2ESecurityBypassAllowedFromHeaders: mock(() => Promise.resolve(false)),
  isE2ESecurityBypassAllowed: () => false,
  isLocalProductionE2EEnv: () => false,
  isCustomerE2ELoginEnabled: () => false,
  isCustomerE2ELoginEnvEnabled: () => false,
}));

mock.module("@/shared/lib/rate-limit", () => ({
  getClientIpFromHeaders: mock(() => Promise.resolve("203.0.113.1")),
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedTurnstileSecretKey: mockGetDecryptedTurnstileSecretKey,
  getTurnstileConfig: mockGetTurnstileConfig,
}));

mock.module("@/shared/lib/turnstile", () => ({
  isTurnstileEnabled: (context: TurnstileVerifyContext) => context.enabled,
  verifyTurnstileToken: mockVerifyTurnstileTokenLib,
}));

const { validateTurnstile } =
  await import("@/shared/domain/settings/turnstile");

afterEach(() => {
  mockGetDecryptedTurnstileSecretKey.mockClear();
  mockGetTurnstileConfig.mockClear();
  mockVerifyTurnstileTokenLib.mockClear();
  mockServerEnv["NODE_ENV"] = "test";
  mockServerEnv["TURNSTILE_SECRET_KEY"] = undefined;
  mockClientEnv["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] = undefined;
  mockGetDecryptedTurnstileSecretKey.mockResolvedValue(null);
  mockGetTurnstileConfig.mockResolvedValue({
    siteKey: null,
    secretKeyMasked: null,
    lastTestedAt: null,
    connectionStatus: null,
    envFallbackActive: false,
  });
});

describe("validateTurnstile", () => {
  test("development/test では Turnstile 無効設定を dev-friendly にスキップできる", async () => {
    mockServerEnv["NODE_ENV"] = "test";

    await expect(
      validateTurnstile({
        token: undefined,
        expectedAction: TURNSTILE_ACTIONS.inquiry,
      }),
    ).resolves.toEqual({ success: true });

    expect(mockVerifyTurnstileTokenLib).not.toHaveBeenCalled();
  });

  test("production では Turnstile 無効設定でも token 未検証を成功扱いにしない", async () => {
    mockServerEnv["NODE_ENV"] = "production";

    await expect(
      validateTurnstile({
        token: undefined,
        expectedAction: TURNSTILE_ACTIONS.inquiry,
      }),
    ).resolves.toEqual({
      success: false,
      error: "セキュリティ検証が必要です。ページを再読み込みしてください。",
    });

    expect(mockVerifyTurnstileTokenLib).not.toHaveBeenCalled();
  });
});
