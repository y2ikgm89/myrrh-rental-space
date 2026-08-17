/**
 * 接続テスト Server Action は保存済み DB 資格情報だけを対象にする。
 * 未保存・復号失敗は VALIDATION「先に保存してください」で、CONNECTED を記録しない。
 */

import { beforeEach, describe, expect, mock, test } from "bun:test";
import { isDomainError } from "@/shared/domain/domain-error";
import { ConnectionStatus } from "@/shared/lib/validations/enums/prisma-types";

const mockGetDecryptedResendApiKey = mock<() => Promise<string | null>>(() =>
  Promise.resolve(null),
);
const mockGetTurnstileSiteKeyUncached = mock<() => Promise<string | null>>(() =>
  Promise.resolve(null),
);
const mockGetDecryptedTurnstileSecretKey = mock<() => Promise<string | null>>(
  () => Promise.resolve(null),
);
const mockGetDecryptedGoogleMapsApiKey = mock<() => Promise<string | null>>(
  () => Promise.resolve(null),
);
const mockGetDecryptedSwitchBotCredentialsForRevocation = mock<
  () => Promise<{ openToken: string; secretKey: string } | null>
>(() => Promise.resolve(null));
const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockTestResendConnection = mock(async (_apiKey: string) => ({
  success: true as const,
  message: "ok",
}));
const mockTestTurnstileConnection = mock(
  (_siteKey: string, _secretKey: string) => ({
    success: true as const,
    message: "ok",
    metadata: { note: "format-only" },
  }),
);
const mockTestGoogleMapsConnection = mock(async (_apiKey: string) => ({
  success: true as const,
  message: "ok",
}));
const mockTestSwitchBotConnection = mock(
  async (_openToken: string, _secretKey: string) => ({
    success: true as const,
    message: "ok",
    metadata: { deviceCount: 2 },
  }),
);

const mockRecordResendConnectionStatus = mock(async () => undefined);
const mockRecordTurnstileConnectionStatus = mock(async () => undefined);
const mockRecordGoogleMapsConnectionStatus = mock(async () => undefined);
const mockRecordSwitchBotConnectionStatus = mock(async () => undefined);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  updateTag: mock(() => undefined),
  cacheTag: mock(() => undefined),
  cacheLife: mock(() => undefined),
}));
mock.module("@/shared/lib/cache/site-wide", () => ({
  invalidateSiteWideCache: mock(() => undefined),
}));
mock.module("@/shared/lib/cache/batcher", () => ({
  withPurgeBatch: (fn: () => Promise<unknown>) => fn(),
}));
mock.module("@/admin/lib/admin-action", () => ({
  executeAdminMutationResult: async (options: {
    execute: (user: { id: string }) => Promise<unknown>;
    afterSuccess?: (data: unknown) => Promise<void> | void;
  }) => {
    try {
      const data = await options.execute({ id: "admin-1" });
      await options.afterSuccess?.(data);
      return data;
    } catch (error) {
      if (isDomainError(error)) {
        return { error: error.message, code: error.code };
      }
      throw error;
    }
  },
}));
mock.module("@/admin/lib/api-keys", () => ({
  testResendConnection: (apiKey: string) => mockTestResendConnection(apiKey),
  testTurnstileConnection: (siteKey: string, secretKey: string) =>
    mockTestTurnstileConnection(siteKey, secretKey),
  testGoogleMapsConnection: (apiKey: string) =>
    mockTestGoogleMapsConnection(apiKey),
  testSwitchBotConnection: (openToken: string, secretKey: string) =>
    mockTestSwitchBotConnection(openToken, secretKey),
}));
mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedResendApiKey: () => mockGetDecryptedResendApiKey(),
  getTurnstileSiteKeyUncached: () => mockGetTurnstileSiteKeyUncached(),
  getDecryptedTurnstileSecretKey: () => mockGetDecryptedTurnstileSecretKey(),
  getDecryptedGoogleMapsApiKey: () => mockGetDecryptedGoogleMapsApiKey(),
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
  getDecryptedSwitchBotCredentialsForRevocation: () =>
    mockGetDecryptedSwitchBotCredentialsForRevocation(),
}));
mock.module("@/shared/domain/settings/api-key-commands", () => ({
  clearGoogleMapsSettings: async () => undefined,
  clearResendSettings: async () => undefined,
  clearSwitchBotSettings: async () => undefined,
  clearTurnstileSettings: async () => undefined,
  ensureSwitchBotWebhookPathToken: async () => "token",
  getSwitchBotWebhookRegistrationStatus: async () => "registered",
  recordGoogleMapsConnectionStatus: (status: ConnectionStatus) =>
    mockRecordGoogleMapsConnectionStatus(status),
  recordResendConnectionStatus: (status: ConnectionStatus) =>
    mockRecordResendConnectionStatus(status),
  recordSwitchBotConnectionStatus: (status: ConnectionStatus) =>
    mockRecordSwitchBotConnectionStatus(status),
  recordTurnstileConnectionStatus: (status: ConnectionStatus) =>
    mockRecordTurnstileConnectionStatus(status),
  rotateSwitchBotWebhookPathToken: async () => undefined,
  updateGoogleMapsSettings: async () => undefined,
  updateResendSettings: async () => undefined,
  updateSwitchBotSettings: async () => undefined,
  updateTurnstileSettings: async () => undefined,
}));
mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  setupWebhook: async () => ({ ok: true }),
}));
mock.module("@/shared/lib/constants", () => ({
  CACHE_TAGS: { INTEGRATION_SETTINGS: "integration-settings" },
  getAppUrl: () => "https://example.com",
}));

const {
  testResendConnectionAction,
  testTurnstileConnectionAction,
  testGoogleMapsConnectionAction,
  testSwitchBotConnectionAction,
} =
  await import("@/app/(admin)/admin/(dashboard)/_shared/actions/api-keys/index");

beforeEach(() => {
  mockGetDecryptedResendApiKey.mockReset();
  mockGetTurnstileSiteKeyUncached.mockReset();
  mockGetDecryptedTurnstileSecretKey.mockReset();
  mockGetDecryptedGoogleMapsApiKey.mockReset();
  mockGetDecryptedSwitchBotCredentialsForRevocation.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockTestResendConnection.mockReset();
  mockTestTurnstileConnection.mockReset();
  mockTestGoogleMapsConnection.mockReset();
  mockTestSwitchBotConnection.mockReset();
  mockRecordResendConnectionStatus.mockReset();
  mockRecordTurnstileConnectionStatus.mockReset();
  mockRecordGoogleMapsConnectionStatus.mockReset();
  mockRecordSwitchBotConnectionStatus.mockReset();

  mockGetDecryptedResendApiKey.mockResolvedValue(null);
  mockGetTurnstileSiteKeyUncached.mockResolvedValue(null);
  mockGetDecryptedTurnstileSecretKey.mockResolvedValue(null);
  mockGetDecryptedGoogleMapsApiKey.mockResolvedValue(null);
  mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue(null);
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);
  mockTestResendConnection.mockResolvedValue({ success: true, message: "ok" });
  mockTestTurnstileConnection.mockReturnValue({
    success: true,
    message: "ok",
    metadata: { note: "format-only" },
  });
  mockTestGoogleMapsConnection.mockResolvedValue({
    success: true,
    message: "ok",
  });
  mockTestSwitchBotConnection.mockResolvedValue({
    success: true,
    message: "ok",
    metadata: { deviceCount: 2 },
  });
});

describe("testResendConnectionAction", () => {
  test("保存済み資格情報が無いと VALIDATION「先に保存してください」を返し CONNECTED を記録しない", async () => {
    const result = await testResendConnectionAction();

    expect(result).toMatchObject({
      error: "先に保存してください",
      code: "VALIDATION",
    });
    expect(mockTestResendConnection).not.toHaveBeenCalled();
    expect(mockRecordResendConnectionStatus).not.toHaveBeenCalled();
  });

  test("保存済み資格情報で testResendConnection を実行し結果を記録する", async () => {
    mockGetDecryptedResendApiKey.mockResolvedValue("re_saved_key");

    const result = await testResendConnectionAction();

    expect(result).toBeNull();
    expect(mockTestResendConnection).toHaveBeenCalledWith("re_saved_key");
    expect(mockRecordResendConnectionStatus).toHaveBeenCalledWith(
      ConnectionStatus.CONNECTED,
    );
  });
});

describe("testTurnstileConnectionAction", () => {
  test("保存済み資格情報が無いと VALIDATION「先に保存してください」を返し CONNECTED を記録しない", async () => {
    const result = await testTurnstileConnectionAction();

    expect(result).toMatchObject({
      error: "先に保存してください",
      code: "VALIDATION",
    });
    expect(mockTestTurnstileConnection).not.toHaveBeenCalled();
    expect(mockRecordTurnstileConnectionStatus).not.toHaveBeenCalled();
  });

  test("保存済み資格情報で testTurnstileConnection を実行し結果を記録する", async () => {
    mockGetTurnstileSiteKeyUncached.mockResolvedValue("0xSITE");
    mockGetDecryptedTurnstileSecretKey.mockResolvedValue("0xSECRET");

    const result = await testTurnstileConnectionAction();

    expect(result).toEqual({ note: "format-only" });
    expect(mockTestTurnstileConnection).toHaveBeenCalledWith(
      "0xSITE",
      "0xSECRET",
    );
    expect(mockRecordTurnstileConnectionStatus).toHaveBeenCalledWith(
      ConnectionStatus.CONNECTED,
    );
  });
});

describe("testGoogleMapsConnectionAction", () => {
  test("保存済み資格情報が無いと VALIDATION「先に保存してください」を返し CONNECTED を記録しない", async () => {
    const result = await testGoogleMapsConnectionAction();

    expect(result).toMatchObject({
      error: "先に保存してください",
      code: "VALIDATION",
    });
    expect(mockTestGoogleMapsConnection).not.toHaveBeenCalled();
    expect(mockRecordGoogleMapsConnectionStatus).not.toHaveBeenCalled();
  });

  test("保存済み資格情報で testGoogleMapsConnection を実行し結果を記録する", async () => {
    mockGetDecryptedGoogleMapsApiKey.mockResolvedValue("AIzaSaved");

    const result = await testGoogleMapsConnectionAction();

    expect(result).toBeNull();
    expect(mockTestGoogleMapsConnection).toHaveBeenCalledWith("AIzaSaved");
    expect(mockRecordGoogleMapsConnectionStatus).toHaveBeenCalledWith(
      ConnectionStatus.CONNECTED,
    );
  });
});

describe("testSwitchBotConnectionAction", () => {
  test("保存済み資格情報が無いと VALIDATION「先に保存してください」を返し CONNECTED を記録しない", async () => {
    const result = await testSwitchBotConnectionAction();

    expect(result).toMatchObject({
      error: "先に保存してください",
      code: "VALIDATION",
    });
    expect(mockTestSwitchBotConnection).not.toHaveBeenCalled();
    expect(mockRecordSwitchBotConnectionStatus).not.toHaveBeenCalled();
  });

  test("enabled が false でも revocation helper の保存済み資格情報で接続テストする", async () => {
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue({
      openToken: "saved-token",
      secretKey: "saved-secret",
    });
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

    const result = await testSwitchBotConnectionAction();

    expect(result).toEqual({ note: "2台のデバイスが見つかりました" });
    expect(mockTestSwitchBotConnection).toHaveBeenCalledWith(
      "saved-token",
      "saved-secret",
    );
    expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
    expect(mockRecordSwitchBotConnectionStatus).toHaveBeenCalledWith(
      ConnectionStatus.CONNECTED,
    );
  });
});
