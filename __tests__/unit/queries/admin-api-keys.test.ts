import { beforeEach, describe, expect, mock, test } from "bun:test";
import { SUPER_ADMIN_USER, VIEWER_USER } from "../../fixtures/users";

let notFoundCalls = 0;
const mockVerifyAdminSession = mock(async () => SUPER_ADMIN_USER);
const mockRecordPermissionDenied = mock(async () => {});
const mockHeaders = mock(async () => new Headers());

mock.module("next/navigation", () => ({
  notFound: () => {
    notFoundCalls += 1;
    throw new Error("NOT_FOUND");
  },
}));
mock.module("next/headers", () => ({ headers: () => mockHeaders() }));

// session は実モジュールを spread し、認証境界の verifyAdminSession だけ差し替える
const actualSession = await import("@/shared/domain/admin-auth/session");
mock.module("@/shared/domain/admin-auth/session", () => ({
  ...actualSession,
  verifyAdminSession: () => mockVerifyAdminSession(),
}));

// `@/shared/lib/admin-permissions` は mock しない（実 ROLE_PERMISSIONS で判定させる）
mock.module("@/admin/lib/audit", () => ({
  recordPermissionDenied: (
    ...args: Parameters<typeof mockRecordPermissionDenied>
  ) => mockRecordPermissionDenied(...args),
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getResendConfig: async () => ({
    apiKeyMasked: null,
    webhookSecretMasked: null,
    lastTestedAt: null,
    connectionStatus: null,
    envFallbackActive: false,
  }),
  getTurnstileConfig: async () => ({
    siteKey: null,
    secretKeyMasked: null,
    lastTestedAt: null,
    connectionStatus: null,
    envFallbackActive: false,
  }),
  getGoogleMapsConfig: async () => ({
    apiKeyMasked: null,
    lastTestedAt: null,
    connectionStatus: null,
  }),
  getSwitchBotConfig: async () => ({
    enabled: false,
    openTokenMasked: null,
    secretKeyMasked: null,
    passcodeBufferMinutes: 0,
    lastTestedAt: null,
    connectionStatus: null,
  }),
}));

mock.module("@/shared/domain/instagram/queries", () => ({
  getInstagramConfig: async () => ({
    isConnected: false,
    username: null,
    accountType: null,
    tokenExpiresAt: null,
    tokenExpiryDays: null,
    shouldRefreshToken: false,
  }),
}));

const { getResendConfig } = await import("@/admin/queries/api-keys");
const { getInstagramConfig } = await import("@/admin/queries/instagram");

describe("admin integration config readers", () => {
  beforeEach(() => {
    notFoundCalls = 0;
    mockVerifyAdminSession.mockReset();
    mockRecordPermissionDenied.mockReset();
    mockHeaders.mockReset();

    mockVerifyAdminSession.mockResolvedValue(SUPER_ADMIN_USER);
    mockRecordPermissionDenied.mockResolvedValue(undefined);
    mockHeaders.mockResolvedValue(new Headers());
  });

  test("getResendConfig は settings:manage を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(getResendConfig()).rejects.toThrow("NOT_FOUND");
    expect(notFoundCalls).toBe(1);
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "settings",
      "manage",
      undefined, // authorizeAdmin は常に 4 引数（resourceId 無しは undefined）
    );

    mockVerifyAdminSession.mockResolvedValue(SUPER_ADMIN_USER);
    await expect(getResendConfig()).resolves.toBeDefined();
  });

  test("getInstagramConfig は settings:manage を要求する", async () => {
    mockVerifyAdminSession.mockResolvedValue(VIEWER_USER);
    await expect(getInstagramConfig()).rejects.toThrow("NOT_FOUND");
    expect(notFoundCalls).toBe(1);
    expect(mockRecordPermissionDenied).toHaveBeenCalledWith(
      VIEWER_USER.id,
      "settings",
      "manage",
      undefined,
    );

    mockVerifyAdminSession.mockResolvedValue(SUPER_ADMIN_USER);
    await expect(getInstagramConfig()).resolves.toBeDefined();
  });
});
