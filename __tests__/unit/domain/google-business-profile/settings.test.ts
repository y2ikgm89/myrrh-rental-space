import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { GbpAuthState } from "@/shared/lib/google-business-profile/types";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

type SettingsRow = {
  id: string;
  googleBusinessProfileEnabled: boolean;
  googleBusinessProfileAuth: { encrypted: string } | null;
};

const mockSettingsFindUnique = mock<() => Promise<SettingsRow | null>>(() =>
  Promise.resolve(null),
);
const mockSettingsUpsert = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "singleton" }),
);
const mockSettingsUpdate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "singleton" }),
);

// crypto は実装をそのまま使う（setup.ts の ENCRYPTION_KEY="a".repeat(64)）
const mockEncrypt = mock<(plaintext: string) => string>((p) => `enc:${p}`);
const mockDecrypt = mock<(ciphertext: string) => string>((c) =>
  c.startsWith("enc:") ? c.slice(4) : "",
);

const mockLogError = mock(() => {});

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: {
      findUnique: mockSettingsFindUnique,
      upsert: mockSettingsUpsert,
      update: mockSettingsUpdate,
    },
  },
}));

mock.module("@/shared/lib/crypto", () => ({
  encrypt: (plaintext: string, _opts?: unknown) => mockEncrypt(plaintext),
  decrypt: (ciphertext: string) => mockDecrypt(ciphertext),
}));

mock.module("@/shared/lib/errors/server", () => ({
  ErrorCategory: { UNKNOWN: "UNKNOWN" },
  ErrorSeverity: { HIGH: "HIGH" },
  logError: mockLogError,
  normalizeError: (e: unknown) =>
    e instanceof Error ? e : new Error(String(e)),
}));

// `Prisma.JsonNull` runtime sentinel
mock.module("@generated/prisma/client", () => ({
  Prisma: { JsonNull: { __jsonNull: true } },
}));

const { getGbpAuthState, saveGbpAuthState, clearGbpAuthState } =
  await import("@/shared/domain/google-business-profile/settings");

const VALID_AUTH: GbpAuthState = {
  accessToken: "tok-abc",
  refreshToken: "ref-xyz",
  expiresAt: 1_700_000_000,
  accountId: "acc-1",
  accountName: "accounts/123",
};

describe("getGbpAuthState", () => {
  beforeEach(() => {
    mockSettingsFindUnique.mockReset();
    mockDecrypt.mockReset();
    mockDecrypt.mockImplementation((c) =>
      c.startsWith("enc:") ? c.slice(4) : "",
    );
    mockLogError.mockReset();
  });

  test("Settings レコードが存在しない場合 null を返す", async () => {
    mockSettingsFindUnique.mockResolvedValueOnce(null);

    const result = await getGbpAuthState();

    expect(result).toBeNull();
  });

  test("googleBusinessProfileEnabled === false で null を返す（decrypt せず）", async () => {
    mockSettingsFindUnique.mockResolvedValueOnce({
      id: "singleton",
      googleBusinessProfileEnabled: false,
      googleBusinessProfileAuth: { encrypted: "enc:dummy" },
    });

    const result = await getGbpAuthState();

    expect(result).toBeNull();
    expect(mockDecrypt).not.toHaveBeenCalled();
  });

  test("envelope shape 不正は null を返す", async () => {
    mockSettingsFindUnique.mockResolvedValueOnce({
      id: "singleton",
      googleBusinessProfileEnabled: true,
      googleBusinessProfileAuth: null,
    });

    const result = await getGbpAuthState();

    expect(result).toBeNull();
  });

  test("正常な暗号化済み auth state を decrypt + parse して返す", async () => {
    mockSettingsFindUnique.mockResolvedValueOnce({
      id: "singleton",
      googleBusinessProfileEnabled: true,
      googleBusinessProfileAuth: {
        encrypted: `enc:${JSON.stringify(VALID_AUTH)}`,
      },
    });

    const result = await getGbpAuthState();

    expect(result).toEqual(VALID_AUTH);
  });

  test("decrypt 後の JSON が GbpAuthState 形状不正なら null + logError(HIGH)", async () => {
    mockSettingsFindUnique.mockResolvedValueOnce({
      id: "singleton",
      googleBusinessProfileEnabled: true,
      googleBusinessProfileAuth: {
        encrypted: `enc:${JSON.stringify({ accessToken: "tok" })}`, // 必須 field 不足
      },
    });

    const result = await getGbpAuthState();

    expect(result).toBeNull();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });

  test("decrypt 失敗時は null + logError(HIGH)", async () => {
    mockSettingsFindUnique.mockResolvedValueOnce({
      id: "singleton",
      googleBusinessProfileEnabled: true,
      googleBusinessProfileAuth: { encrypted: "broken-cipher" },
    });
    mockDecrypt.mockImplementationOnce(() => {
      throw new Error("decrypt failed");
    });

    const result = await getGbpAuthState();

    expect(result).toBeNull();
    expect(mockLogError).toHaveBeenCalledTimes(1);
  });
});

describe("saveGbpAuthState", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
    mockSettingsUpdate.mockReset();
    mockEncrypt.mockReset();
    mockEncrypt.mockImplementation((p) => `enc:${p}`);
  });

  test("auth state を encrypt + Settings.update で保存し enabled を true にする", async () => {
    await saveGbpAuthState(VALID_AUTH);

    expect(mockEncrypt).toHaveBeenCalledWith(JSON.stringify(VALID_AUTH));
    expect(mockSettingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleBusinessProfileEnabled: true,
          googleBusinessProfileAuth: {
            encrypted: `enc:${JSON.stringify(VALID_AUTH)}`,
          },
        }),
      }),
    );
  });
});

describe("clearGbpAuthState", () => {
  beforeEach(() => {
    mockSettingsUpsert.mockReset();
    mockSettingsUpsert.mockResolvedValue({ id: "singleton" });
    mockSettingsUpdate.mockReset();
  });

  test("auth を Prisma.JsonNull にし enabled を false にする", async () => {
    await clearGbpAuthState();

    expect(mockSettingsUpdate).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          googleBusinessProfileEnabled: false,
          // mock した Prisma.JsonNull sentinel が渡される
          googleBusinessProfileAuth: { __jsonNull: true },
        }),
      }),
    );
  });
});
