/**
 * api-key-commands の「公開キー / ID = 空は既存維持」回帰テスト。
 *
 * Site Key（Turnstile）は管理 UI の「変更」ボタンでロックされ、ロック中の保存は
 * 空送信になる。空（falsy）を「既存値を維持」として扱い（秘密キーと同じ意味論）、
 * ロック中の保存で値が消えないことを保証する。クリアは clear* command 経由。
 *
 * Cloudflare は env-only 設計に移行したため対象外。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

type SettingsUpsertArgs = { update?: Record<string, unknown> };
const mockSettingsUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));

const mockFindManyPasscodes = mock<
  (...args: unknown[]) => Promise<
    {
      id: string;
      status: string;
      switchbotKeyId: string | null;
      device: { deviceId: string };
    }[]
  >
>(() => Promise.resolve([]));

const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockRevokeOne = mock<(...args: unknown[]) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockGetSwitchBotWebhookAuth = mock<
  () => Promise<{ enabled: boolean; pathToken: string | null }>
>(() => Promise.resolve({ enabled: false, pathToken: null }));

const mockDeleteWebhook = mock<
  (...args: unknown[]) => Promise<{ ok: boolean; message?: string }>
>(() => Promise.resolve({ ok: true }));

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: { upsert: mockSettingsUpsert },
    smartLockPasscode: {
      findMany: (...args: unknown[]) => mockFindManyPasscodes(...args),
    },
  },
}));
mock.module("@/shared/lib/crypto", () => ({
  encrypt: (v: string) => `enc:${v}`,
  safeDecrypt: (v: string) => v,
  safeDecryptToString: (v: string | null | undefined) => v ?? null,
}));
mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
  getSwitchBotWebhookAuth: () => mockGetSwitchBotWebhookAuth(),
}));
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeOne: (...args: unknown[]) => mockRevokeOne(...args),
}));
mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  deleteWebhook: (...args: unknown[]) => mockDeleteWebhook(...args),
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://example.com",
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

import {
  updateTurnstileSettings,
  clearSwitchBotSettings,
} from "@/shared/domain/settings/api-key-commands";

const CREDENTIALS = {
  openToken: "token",
  secretKey: "secret",
  passcodeBufferMinutes: 15,
};

function lastUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

beforeEach(() => {
  mockSettingsUpsert.mockClear();
  mockFindManyPasscodes.mockReset();
  mockGetDecryptedSwitchBotCredentials.mockReset();
  mockRevokeOne.mockReset();
  mockGetSwitchBotWebhookAuth.mockReset();
  mockDeleteWebhook.mockReset();
  mockLogError.mockReset();

  mockFindManyPasscodes.mockResolvedValue([]);
  mockGetDecryptedSwitchBotCredentials.mockResolvedValue(CREDENTIALS);
  mockRevokeOne.mockResolvedValue(true);
  mockGetSwitchBotWebhookAuth.mockResolvedValue({
    enabled: true,
    pathToken: "path-token-123",
  });
  mockDeleteWebhook.mockResolvedValue({ ok: true });
});

describe("updateTurnstileSettings", () => {
  test("Site Key が null（ロック中の空送信）の場合は既存値を維持する", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: null,
      turnstileSecretKey: null,
    });
    expect(Object.keys(lastUpdate())).not.toContain("turnstileSiteKey");
    expect(Object.keys(lastUpdate())).not.toContain("turnstileSecretKey");
  });

  test("Site Key を指定すると保存される", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: "0xNEWSITEKEY",
      turnstileSecretKey: null,
    });
    expect(lastUpdate()["turnstileSiteKey"]).toBe("0xNEWSITEKEY");
  });

  test("Secret Key を指定すると暗号化して保存され、Site Key は維持される", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: null,
      turnstileSecretKey: "0xSECRET",
    });
    expect(lastUpdate()["turnstileSecretKey"]).toBe("enc:0xSECRET");
    expect(Object.keys(lastUpdate())).not.toContain("turnstileSiteKey");
  });
});

describe("clearSwitchBotSettings", () => {
  test("生きたパスコードが無ければそのままクリアでき、webhookも解除される", async () => {
    mockFindManyPasscodes.mockResolvedValue([]);

    await clearSwitchBotSettings();

    expect(lastUpdate()["switchbotOpenToken"]).toBeNull();
    expect(mockRevokeOne).not.toHaveBeenCalled();
    expect(mockDeleteWebhook).toHaveBeenCalledWith(
      CREDENTIALS,
      "https://example.com/api/webhooks/switchbot/path-token-123",
    );
  });

  test("webhook未登録(pathToken null)の場合はdeleteWebhookを呼ばずクリアできる", async () => {
    mockGetSwitchBotWebhookAuth.mockResolvedValue({
      enabled: false,
      pathToken: null,
    });

    await clearSwitchBotSettings();

    expect(mockDeleteWebhook).not.toHaveBeenCalled();
    expect(lastUpdate()["switchbotOpenToken"]).toBeNull();
  });

  test("webhook解除に失敗してもクリア自体はブロックしない(ベストエフォート)", async () => {
    mockDeleteWebhook.mockResolvedValue({
      ok: false,
      message: "network error",
    });

    await clearSwitchBotSettings();

    expect(lastUpdate()["switchbotOpenToken"]).toBeNull();
    expect(mockLogError).toHaveBeenCalled();
  });

  test("資格情報が既に復号できない場合はチェックをスキップしてクリアを許可する", async () => {
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);

    await clearSwitchBotSettings();

    expect(mockFindManyPasscodes).not.toHaveBeenCalled();
    expect(mockDeleteWebhook).not.toHaveBeenCalled();
    expect(lastUpdate()["switchbotOpenToken"]).toBeNull();
  });

  test("PENDINGのパスコードが残っている場合はクリアできない", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        id: "p1",
        status: "PENDING",
        switchbotKeyId: null,
        device: { deviceId: "AA:BB" },
      },
    ]);

    await expect(clearSwitchBotSettings()).rejects.toThrow(
      "発行処理中のパスコードが残っているため連携をクリアできません",
    );
    expect(mockRevokeOne).not.toHaveBeenCalled();
  });

  test("CONFIRMEDのパスコードは失効させてからクリアする", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        id: "p1",
        status: "CONFIRMED",
        switchbotKeyId: "key-1",
        device: { deviceId: "AA:BB" },
      },
    ]);
    mockRevokeOne.mockResolvedValue(true);

    await clearSwitchBotSettings();

    expect(mockRevokeOne).toHaveBeenCalledWith(
      CREDENTIALS,
      expect.objectContaining({
        id: "p1",
        switchbotKeyId: "key-1",
        device: { deviceId: "AA:BB" },
      }),
    );
    expect(lastUpdate()["switchbotOpenToken"]).toBeNull();
  });

  test("失効に失敗した場合はクリアをブロックする", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        id: "p1",
        status: "CONFIRMED",
        switchbotKeyId: "key-1",
        device: { deviceId: "AA:BB" },
      },
    ]);
    mockRevokeOne.mockResolvedValue(false);

    await expect(clearSwitchBotSettings()).rejects.toThrow(
      "一部のパスコードの失効に失敗したため連携をクリアできません",
    );
  });
});
