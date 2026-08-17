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
const mockSettingsTurnstileUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsSwitchbotUpsert = mock<
  (args: SettingsUpsertArgs) => Promise<Record<string, unknown>>
>(() => Promise.resolve({ id: "singleton" }));
const mockSettingsSwitchbotFindUnique = mock<
  (...args: unknown[]) => Promise<{
    switchbotEnabled?: boolean;
    switchbotOpenToken?: string | null;
    switchbotSecretKey?: string | null;
    switchbotWebhookPathToken?: string | null;
  } | null>
>(() => Promise.resolve(null));

const mockCountPasscodes = mock<(...args: unknown[]) => Promise<number>>(() =>
  Promise.resolve(0),
);

const mockFindManyPasscodes = mock<
  (...args: unknown[]) => Promise<
    {
      id: string;
      reservationId: string;
      deviceId: string;
      status: string;
      switchbotKeyId: string | null;
      device: { deviceId: string };
    }[]
  >
>(() => Promise.resolve([]));

const mockGetDecryptedSwitchBotCredentialsForRevocation = mock<
  () => Promise<{ openToken: string; secretKey: string } | null>
>(() => Promise.resolve(null));

const mockAwaitDeviceRevokeConfirmation = mock<
  (...args: unknown[]) => Promise<boolean>
>(() => Promise.resolve(true));

const mockRecoverPendingPasscodeViaDeviceList = mock<
  (...args: unknown[]) => Promise<boolean>
>(() => Promise.resolve(true));

const mockRevokeOne = mock<(...args: unknown[]) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockGetSwitchBotWebhookAuth = mock<
  () => Promise<{ enabled: boolean; pathToken: string | null }>
>(() => Promise.resolve({ enabled: false, pathToken: null }));

const mockDeleteWebhook = mock<
  (...args: unknown[]) => Promise<{ ok: boolean; message?: string }>
>(() => Promise.resolve({ ok: true }));

const mockSetupWebhook = mock<
  (...args: unknown[]) => Promise<{ ok: boolean; message?: string }>
>(() => Promise.resolve({ ok: true }));

const mockQueryWebhookUrls = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { urls: string[] } }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: { urls: [] } }));

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

const GENERATED_WEBHOOK_TOKEN = "generated-token";

mock.module("node:crypto", () => ({
  randomBytes: () => ({
    toString: () => GENERATED_WEBHOOK_TOKEN,
  }),
  randomUUID: () => "test-uuid",
}));
mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settingsTurnstile: { upsert: mockSettingsTurnstileUpsert },
    settingsSwitchbot: {
      upsert: mockSettingsSwitchbotUpsert,
      findUnique: (...args: unknown[]) =>
        mockSettingsSwitchbotFindUnique(...args),
    },
    smartLockPasscode: {
      findMany: (...args: unknown[]) => mockFindManyPasscodes(...args),
      count: (...args: unknown[]) => mockCountPasscodes(...args),
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
    mockGetDecryptedSwitchBotCredentialsForRevocation().then((c) =>
      c ? { ...c, passcodeBufferMinutes: 15 } : null,
    ),
  getDecryptedSwitchBotCredentialsForRevocation: () =>
    mockGetDecryptedSwitchBotCredentialsForRevocation(),
  getSwitchBotWebhookAuth: () => mockGetSwitchBotWebhookAuth(),
}));
mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeOne: (...args: unknown[]) => mockRevokeOne(...args),
  recoverPendingPasscodeViaDeviceList: (...args: unknown[]) =>
    mockRecoverPendingPasscodeViaDeviceList(...args),
  awaitDeviceRevokeConfirmation: (...args: unknown[]) =>
    mockAwaitDeviceRevokeConfirmation(...args),
}));
mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  deleteWebhook: (...args: unknown[]) => mockDeleteWebhook(...args),
  setupWebhook: (...args: unknown[]) => mockSetupWebhook(...args),
  queryWebhookUrls: (...args: unknown[]) => mockQueryWebhookUrls(...args),
}));
mock.module("@/shared/lib/constants", () => ({
  getAppUrl: () => "https://example.com",
}));
mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  updateTurnstileSettings,
  updateSwitchBotSettings,
  clearSwitchBotSettings,
  rotateSwitchBotWebhookPathToken,
  getSwitchBotWebhookRegistrationStatus,
} from "@/shared/domain/settings/api-key-commands";

const CREDENTIALS = {
  openToken: "token",
  secretKey: "secret",
  passcodeBufferMinutes: 15,
};

function lastTurnstileUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsTurnstileUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

function lastSwitchbotUpdate(): Record<string, unknown> {
  const lastCall = mockSettingsSwitchbotUpsert.mock.calls.at(-1);
  return lastCall?.[0]?.update ?? {};
}

beforeEach(() => {
  mockSettingsTurnstileUpsert.mockClear();
  mockSettingsSwitchbotUpsert.mockClear();
  mockSettingsSwitchbotFindUnique.mockReset();
  mockFindManyPasscodes.mockReset();
  mockCountPasscodes.mockReset();
  mockGetDecryptedSwitchBotCredentialsForRevocation.mockReset();
  mockRevokeOne.mockReset();
  mockRecoverPendingPasscodeViaDeviceList.mockReset();
  mockAwaitDeviceRevokeConfirmation.mockReset();
  mockGetSwitchBotWebhookAuth.mockReset();
  mockDeleteWebhook.mockReset();
  mockSetupWebhook.mockReset();
  mockQueryWebhookUrls.mockReset();
  mockLogError.mockReset();

  mockSettingsSwitchbotFindUnique.mockResolvedValue(null);

  mockFindManyPasscodes.mockResolvedValue([]);
  mockCountPasscodes.mockResolvedValue(0);
  mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue({
    openToken: "token",
    secretKey: "secret",
  });
  mockRevokeOne.mockResolvedValue(true);
  mockRecoverPendingPasscodeViaDeviceList.mockResolvedValue(true);
  mockAwaitDeviceRevokeConfirmation.mockResolvedValue(true);
  mockGetSwitchBotWebhookAuth.mockResolvedValue({
    enabled: true,
    pathToken: "path-token-123",
  });
  mockDeleteWebhook.mockResolvedValue({ ok: true });
  mockSetupWebhook.mockResolvedValue({ ok: true });
  mockQueryWebhookUrls.mockResolvedValue({ ok: true, body: { urls: [] } });
});

describe("updateTurnstileSettings", () => {
  test("Site Key が null（ロック中の空送信）の場合は既存値を維持する", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: null,
      turnstileSecretKey: null,
    });
    expect(Object.keys(lastTurnstileUpdate())).not.toContain(
      "turnstileSiteKey",
    );
    expect(Object.keys(lastTurnstileUpdate())).not.toContain(
      "turnstileSecretKey",
    );
  });

  test("Site Key を指定すると保存される", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: "0xNEWSITEKEY",
      turnstileSecretKey: null,
    });
    expect(lastTurnstileUpdate()["turnstileSiteKey"]).toBe("0xNEWSITEKEY");
  });

  test("Secret Key を指定すると暗号化して保存され、Site Key は維持される", async () => {
    await updateTurnstileSettings({
      turnstileSiteKey: null,
      turnstileSecretKey: "0xSECRET",
    });
    expect(lastTurnstileUpdate()["turnstileSecretKey"]).toBe("enc:0xSECRET");
    expect(Object.keys(lastTurnstileUpdate())).not.toContain(
      "turnstileSiteKey",
    );
  });
});

describe("clearSwitchBotSettings", () => {
  test("生きたパスコードが無ければそのままクリアでき、webhookも解除される", async () => {
    mockFindManyPasscodes.mockResolvedValue([]);

    await clearSwitchBotSettings();

    expect(lastSwitchbotUpdate()["switchbotOpenToken"]).toBeNull();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBeNull();
    expect(mockRevokeOne).not.toHaveBeenCalled();
    expect(mockDeleteWebhook).toHaveBeenCalledWith(
      { openToken: "token", secretKey: "secret" },
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
    expect(lastSwitchbotUpdate()["switchbotOpenToken"]).toBeNull();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBeNull();
  });

  test("webhook解除に失敗してもクリア自体はブロックしない(ベストエフォート)", async () => {
    mockDeleteWebhook.mockResolvedValue({
      ok: false,
      message: "network error",
    });

    await clearSwitchBotSettings();

    expect(lastSwitchbotUpdate()["switchbotOpenToken"]).toBeNull();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBeNull();
    expect(mockLogError).toHaveBeenCalled();
  });

  test("資格情報が既に復号できない場合はチェックをスキップしてクリアを許可する", async () => {
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue(null);

    await clearSwitchBotSettings();

    expect(mockFindManyPasscodes).not.toHaveBeenCalled();
    expect(mockDeleteWebhook).not.toHaveBeenCalled();
    expect(lastSwitchbotUpdate()["switchbotOpenToken"]).toBeNull();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBeNull();
  });

  test("PENDINGのパスコードはDevice List回収を試み、未解決ならクリアできない", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        id: "p1",
        reservationId: "res-1",
        deviceId: "dev-1",
        status: "PENDING",
        switchbotKeyId: null,
        device: { deviceId: "AA:BB" },
      },
    ]);
    mockRecoverPendingPasscodeViaDeviceList.mockResolvedValue(false);
    mockCountPasscodes.mockResolvedValue(1);

    await expect(clearSwitchBotSettings()).rejects.toThrow(
      "発行処理中のパスコードが残っているため連携をクリアできません",
    );
    expect(mockRecoverPendingPasscodeViaDeviceList).toHaveBeenCalled();
  });

  test("CONFIRMEDのパスコードは失効させてからクリアする", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        id: "p1",
        reservationId: "res-1",
        deviceId: "dev-1",
        status: "CONFIRMED",
        switchbotKeyId: "key-1",
        device: { deviceId: "AA:BB" },
      },
    ]);
    mockRevokeOne.mockResolvedValue(true);

    await clearSwitchBotSettings();

    expect(mockRevokeOne).toHaveBeenCalledWith(
      { openToken: "token", secretKey: "secret" },
      expect.objectContaining({
        id: "p1",
        switchbotKeyId: "key-1",
        device: { deviceId: "AA:BB" },
      }),
    );
    expect(lastSwitchbotUpdate()["switchbotOpenToken"]).toBeNull();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBeNull();
  });

  test("失効に失敗した場合はクリアをブロックする", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        id: "p1",
        reservationId: "res-1",
        deviceId: "dev-1",
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

describe("rotateSwitchBotWebhookPathToken", () => {
  test("資格情報が無い場合はローテーションできない", async () => {
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue(null);

    await expect(rotateSwitchBotWebhookPathToken()).rejects.toThrow(
      "SwitchBot連携が未設定です",
    );
    expect(mockSetupWebhook).not.toHaveBeenCalled();
  });

  test("旧トークンがある場合は解除→DB更新→新URL登録の順で実行する", async () => {
    mockGetSwitchBotWebhookAuth.mockResolvedValue({
      enabled: true,
      pathToken: "old-token",
    });

    await rotateSwitchBotWebhookPathToken();

    expect(mockDeleteWebhook).toHaveBeenCalledWith(
      CREDENTIALS,
      "https://example.com/api/webhooks/switchbot/old-token",
    );
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBe(
      `enc:${GENERATED_WEBHOOK_TOKEN}`,
    );
    expect(mockSetupWebhook).toHaveBeenCalledWith(
      CREDENTIALS,
      `https://example.com/api/webhooks/switchbot/${GENERATED_WEBHOOK_TOKEN}`,
    );
  });

  test("旧トークンが無い場合はdeleteWebhookを呼ばず新トークンを保存する", async () => {
    mockGetSwitchBotWebhookAuth.mockResolvedValue({
      enabled: true,
      pathToken: null,
    });

    await rotateSwitchBotWebhookPathToken();

    expect(mockDeleteWebhook).not.toHaveBeenCalled();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBe(
      `enc:${GENERATED_WEBHOOK_TOKEN}`,
    );
    expect(mockSetupWebhook).toHaveBeenCalled();
  });

  test("deleteWebhook失敗はベストエフォートで続行する", async () => {
    mockDeleteWebhook.mockResolvedValue({
      ok: false,
      message: "not found",
    });

    await rotateSwitchBotWebhookPathToken();

    expect(mockLogError).toHaveBeenCalled();
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBe(
      `enc:${GENERATED_WEBHOOK_TOKEN}`,
    );
    expect(mockSetupWebhook).toHaveBeenCalled();
  });

  test("setupWebhook失敗時は旧トークンを復元せず再登録を案内する", async () => {
    mockSetupWebhook.mockResolvedValue({
      ok: false,
      message: "SwitchBot API error",
    });

    await expect(rotateSwitchBotWebhookPathToken()).rejects.toThrow(
      "Webhook URLトークンの更新に失敗しました。管理画面の「Webhookを登録」から再試行してください",
    );
    expect(lastSwitchbotUpdate()["switchbotWebhookPathToken"]).toBe(
      `enc:${GENERATED_WEBHOOK_TOKEN}`,
    );
  });
});

describe("getSwitchBotWebhookRegistrationStatus", () => {
  test("資格情報が無い場合は VALIDATION で失敗する", async () => {
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue(null);

    const error = await getSwitchBotWebhookRegistrationStatus().catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: "VALIDATION",
      message:
        "SwitchBot連携が未設定です。先にOpen Token/Secret Keyを保存してください",
    });
    expect(mockQueryWebhookUrls).not.toHaveBeenCalled();
  });

  test("pathToken 未発行なら token_not_issued を返す", async () => {
    mockGetSwitchBotWebhookAuth.mockResolvedValue({
      enabled: true,
      pathToken: null,
    });

    await expect(getSwitchBotWebhookRegistrationStatus()).resolves.toBe(
      "token_not_issued",
    );
    expect(mockQueryWebhookUrls).not.toHaveBeenCalled();
  });

  test("期待URLが登録済みなら registered を返す", async () => {
    mockQueryWebhookUrls.mockResolvedValue({
      ok: true,
      body: {
        urls: [
          "https://other.example/webhook",
          "https://example.com/api/webhooks/switchbot/path-token-123",
        ],
      },
    });

    await expect(getSwitchBotWebhookRegistrationStatus()).resolves.toBe(
      "registered",
    );
    expect(mockQueryWebhookUrls).toHaveBeenCalledWith(CREDENTIALS);
  });

  test("期待URLが未登録なら not_registered を返す", async () => {
    mockQueryWebhookUrls.mockResolvedValue({
      ok: true,
      body: { urls: ["https://other.example/webhook"] },
    });

    await expect(getSwitchBotWebhookRegistrationStatus()).resolves.toBe(
      "not_registered",
    );
  });

  test("SwitchBot API 失敗は UNEXPECTED で失敗する", async () => {
    mockQueryWebhookUrls.mockResolvedValue({
      ok: false,
      statusCode: 500,
      message: "network error",
    });

    const error = await getSwitchBotWebhookRegistrationStatus().catch(
      (caught: unknown) => caught,
    );

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: "UNEXPECTED",
    });
    expect(error).toEqual(
      expect.objectContaining({
        message: expect.stringContaining("Webhook登録状態の確認に失敗しました"),
      }),
    );
  });
});

describe("updateSwitchBotSettings", () => {
  test("キー未保存のまま有効化すると VALIDATION で失敗する", async () => {
    const error = await updateSwitchBotSettings({
      switchbotEnabled: true,
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: "VALIDATION",
      message:
        "SwitchBot連携を有効にするには、Open TokenとSecret Keyの両方を保存してください",
    });
    expect(mockSettingsSwitchbotUpsert).not.toHaveBeenCalled();
  });

  test("片方のキーだけ保存し、もう一方が未保存なら VALIDATION で失敗する", async () => {
    const error = await updateSwitchBotSettings({
      switchbotOpenToken: "token-only",
    }).catch((caught: unknown) => caught);

    expect(error).toBeInstanceOf(DomainError);
    expect(error).toMatchObject({
      code: "VALIDATION",
      message: "Open TokenとSecret Keyは両方揃えて保存してください",
    });
    expect(mockSettingsSwitchbotUpsert).not.toHaveBeenCalled();
  });
});
