/**
 * Turnstile domain context 解決テスト
 */

import { describe, test, expect, beforeEach, mock } from "bun:test";

mock.module("server-only", () => ({}));

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

const mockServerEnv: Record<string, string | undefined> = {
  TURNSTILE_SECRET_KEY: undefined,
};
const mockClientEnv: Record<string, string | undefined> = {
  NEXT_PUBLIC_TURNSTILE_SITE_KEY: undefined,
};

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedTurnstileSecretKey: mockGetDecryptedTurnstileSecretKey,
  getTurnstileConfig: mockGetTurnstileConfig,
}));

mock.module("@/shared/lib/env/server", () => ({
  serverEnv: mockServerEnv,
  isLocalhostUrl: () => false,
}));

mock.module("@/shared/lib/env/client", () => ({
  clientEnv: mockClientEnv,
}));

beforeEach(() => {
  mockGetDecryptedTurnstileSecretKey.mockReset();
  mockGetTurnstileConfig.mockReset();
  mockGetDecryptedTurnstileSecretKey.mockResolvedValue(null);
  mockGetTurnstileConfig.mockResolvedValue({
    siteKey: null,
    secretKeyMasked: null,
    lastTestedAt: null,
    connectionStatus: null,
    envFallbackActive: false,
  });
  mockServerEnv["TURNSTILE_SECRET_KEY"] = undefined;
  mockClientEnv["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] = undefined;
});

describe("resolveTurnstileVerifyContext", () => {
  test("DB secret を優先し enabled を site+secret の積で返す", async () => {
    mockGetDecryptedTurnstileSecretKey.mockResolvedValueOnce("db-secret");
    mockGetTurnstileConfig.mockResolvedValueOnce({
      siteKey: "site-key",
      secretKeyMasked: "***",
      lastTestedAt: null,
      connectionStatus: null,
      envFallbackActive: false,
    });

    const { resolveTurnstileVerifyContext } =
      await import("@/shared/domain/settings/turnstile");
    await expect(resolveTurnstileVerifyContext()).resolves.toEqual({
      secretKey: "db-secret",
      enabled: true,
    });
  });

  test("DB secret 未設定時は env TURNSTILE_SECRET_KEY にフォールバックする", async () => {
    mockServerEnv["TURNSTILE_SECRET_KEY"] = "env-secret";
    mockClientEnv["NEXT_PUBLIC_TURNSTILE_SITE_KEY"] = "env-site";
    mockGetDecryptedTurnstileSecretKey.mockResolvedValueOnce(null);
    mockGetTurnstileConfig.mockResolvedValueOnce({
      siteKey: null,
      secretKeyMasked: null,
      lastTestedAt: null,
      connectionStatus: null,
      envFallbackActive: true,
    });

    const { resolveTurnstileVerifyContext } =
      await import("@/shared/domain/settings/turnstile");
    await expect(resolveTurnstileVerifyContext()).resolves.toEqual({
      secretKey: "env-secret",
      enabled: true,
    });
  });

  test("site key 欠落時は enabled: false", async () => {
    mockGetDecryptedTurnstileSecretKey.mockResolvedValueOnce("db-secret");
    mockGetTurnstileConfig.mockResolvedValueOnce({
      siteKey: null,
      secretKeyMasked: "***",
      lastTestedAt: null,
      connectionStatus: null,
      envFallbackActive: false,
    });

    const { resolveTurnstileVerifyContext } =
      await import("@/shared/domain/settings/turnstile");
    await expect(resolveTurnstileVerifyContext()).resolves.toEqual({
      secretKey: "db-secret",
      enabled: false,
    });
  });
});
