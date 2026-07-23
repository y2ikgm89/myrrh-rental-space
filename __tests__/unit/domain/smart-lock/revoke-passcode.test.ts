/**
 * revokeOne / revokeSmartLockPasscodesForReservation / revokeExpiredSmartLockPasscodes のテスト
 * (audit finding #12)
 *
 * SwitchBot API クライアント / Prisma / settings クエリをすべてモックして
 * CONFIRMED ガード・switchbotKeyId null スキップ・credentials null 早期 return 等を検証する。
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

// -----------------------------------------------------------------------
// モック関数定義（mock.module より前・TDZ 回避）
// -----------------------------------------------------------------------

const mockUpdateMany = mock<(...args: unknown[]) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 1 }),
);

const mockFindMany = mock<
  (...args: unknown[]) => Promise<
    Array<{
      id: string;
      switchbotKeyId: string | null;
      device: { deviceId: string };
    }>
  >
>(() => Promise.resolve([]));

const mockDeletePasscode = mock<
  (
    ...args: unknown[]
  ) => Promise<
    { ok: true } | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true }));

const mockGetDecryptedSwitchBotCredentials = mock<
  () => Promise<{
    openToken: string;
    secretKey: string;
    passcodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockPasscode: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentials: () =>
    mockGetDecryptedSwitchBotCredentials(),
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  deletePasscode: (...args: unknown[]) => mockDeletePasscode(...args),
  createPasscode: () =>
    Promise.resolve({ ok: true, body: { commandId: "cmd" } }),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: {
    DATABASE: "DATABASE",
    EXTERNAL_API: "EXTERNAL_API",
    VALIDATION: "VALIDATION",
    UNKNOWN: "UNKNOWN",
  },
  ErrorSeverity: {
    CRITICAL: "CRITICAL",
    HIGH: "HIGH",
    MEDIUM: "MEDIUM",
    LOW: "LOW",
  },
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  SmartLockPasscodeStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    REVOKED: "REVOKED",
    FAILED: "FAILED",
  },
  ReservationStatus: {
    PENDING: "PENDING",
    CONFIRMED: "CONFIRMED",
    CANCELLED: "CANCELLED",
  },
}));

mock.module("@/shared/domain/notifications/commands", () => ({
  createNotificationCommand: () => Promise.resolve(),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: () => undefined,
}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  NOTIFICATION_TYPE: {
    SMART_LOCK_PASSCODE_FAILED: "SMART_LOCK_PASSCODE_FAILED",
  },
  NOTIFICATION_TYPE_LABELS: {
    SMART_LOCK_PASSCODE_FAILED: "スマートロックパスコード失敗",
  },
  ACTIVE_RESERVATION_STATUSES: ["PENDING", "CONFIRMED"],
}));

const {
  revokeOne,
  revokeSmartLockPasscodesForReservation,
  revokeExpiredSmartLockPasscodes,
} = await import("@/shared/domain/smart-lock/revoke-passcode");

// -----------------------------------------------------------------------
// テスト定数
// -----------------------------------------------------------------------

const CREDENTIALS = { openToken: "open-token", secretKey: "secret-key" };
const DEVICE = { deviceId: "AA:BB:CC:DD:EE:FF" };

// -----------------------------------------------------------------------
// revokeOne
// -----------------------------------------------------------------------

describe("revokeOne", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockDeletePasscode.mockReset();
    mockLogError.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockDeletePasscode.mockResolvedValue({ ok: true });
  });

  test("switchbotKeyId が null の場合は false を返し logError を呼ぶ（CONFIRMED なのに keyId 未確定ガード）", async () => {
    const passcode = { id: "pcode-1", switchbotKeyId: null, device: DEVICE };
    const result = await revokeOne(CREDENTIALS, passcode);
    expect(result).toBe(false);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockDeletePasscode).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("deletePasscode が失敗 (ok: false) の場合は false を返し logError を呼ぶ", async () => {
    mockDeletePasscode.mockResolvedValue({
      ok: false,
      statusCode: 190,
      message: "key not found",
    });
    const passcode = {
      id: "pcode-2",
      switchbotKeyId: "key-xyz",
      device: DEVICE,
    };
    const result = await revokeOne(CREDENTIALS, passcode);
    expect(result).toBe(false);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    // deleteKey 失敗のため updateMany (REVOKED 更新) は呼ばない
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("deletePasscode 成功時は status=CONFIRMED の where を付けて REVOKED に updateMany し true を返す", async () => {
    const passcode = {
      id: "pcode-3",
      switchbotKeyId: "key-abc",
      device: DEVICE,
    };
    const result = await revokeOne(CREDENTIALS, passcode);
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "pcode-3", status: "CONFIRMED" },
        data: expect.objectContaining({ status: "REVOKED" }),
      }),
    );
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("deletePasscode に正しい deviceId と keyId を渡す", async () => {
    const passcode = {
      id: "pcode-4",
      switchbotKeyId: "key-device-id",
      device: { deviceId: "11:22:33:44:55:66" },
    };
    await revokeOne(CREDENTIALS, passcode);
    expect(mockDeletePasscode).toHaveBeenCalledWith(
      CREDENTIALS,
      "11:22:33:44:55:66",
      "key-device-id",
    );
  });
});

// -----------------------------------------------------------------------
// revokeSmartLockPasscodesForReservation
// -----------------------------------------------------------------------

describe("revokeSmartLockPasscodesForReservation", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockGetDecryptedSwitchBotCredentials.mockReset();
    mockDeletePasscode.mockReset();
    mockUpdateMany.mockReset();
    mockLogError.mockReset();
    mockDeletePasscode.mockResolvedValue({ ok: true });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("CONFIRMED パスコードが 0 件の場合は credentials 取得も API 呼出もしない", async () => {
    mockFindMany.mockResolvedValue([]);
    await revokeSmartLockPasscodesForReservation("res-1");
    expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
    expect(mockDeletePasscode).not.toHaveBeenCalled();
  });

  test("credentials が null の場合はエラーログを出して deleteKey を呼ばない", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: "key-1", device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);
    await revokeSmartLockPasscodesForReservation("res-2");
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockDeletePasscode).not.toHaveBeenCalled();
  });

  test("credentials が有効な場合は各パスコードに対して deleteKey を呼ぶ", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: "key-1", device: DEVICE },
      { id: "p2", switchbotKeyId: "key-2", device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
      openToken: "open-token",
      secretKey: "secret-key",
      passcodeBufferMinutes: 15,
    });
    await revokeSmartLockPasscodesForReservation("res-3");
    expect(mockDeletePasscode).toHaveBeenCalledTimes(2);
  });
});

// -----------------------------------------------------------------------
// revokeExpiredSmartLockPasscodes
// -----------------------------------------------------------------------

describe("revokeExpiredSmartLockPasscodes", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockGetDecryptedSwitchBotCredentials.mockReset();
    mockDeletePasscode.mockReset();
    mockUpdateMany.mockReset();
    mockLogError.mockReset();
    mockDeletePasscode.mockResolvedValue({ ok: true });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("失効候補が 0 件の場合は { revoked: 0, failed: 0 } を返す", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 0, failed: 0 });
    expect(mockGetDecryptedSwitchBotCredentials).not.toHaveBeenCalled();
  });

  test("候補があって credentials が null の場合は { revoked: 0, failed: N } を返す", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: "key-1", device: DEVICE },
      { id: "p2", switchbotKeyId: "key-2", device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue(null);
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 0, failed: 2 });
  });

  test("全件成功の場合は { revoked: N, failed: 0 } を返す", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: "key-1", device: DEVICE },
      { id: "p2", switchbotKeyId: "key-2", device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
      openToken: "open-token",
      secretKey: "secret-key",
      passcodeBufferMinutes: 15,
    });
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 2, failed: 0 });
  });

  test("一部失敗の場合は revoked / failed カウントが正確", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: "key-1", device: DEVICE },
      { id: "p2", switchbotKeyId: "key-2", device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
      openToken: "open-token",
      secretKey: "secret-key",
      passcodeBufferMinutes: 15,
    });
    // p1 は成功、p2 は deleteKey 失敗
    mockDeletePasscode
      .mockResolvedValueOnce({ ok: true })
      .mockResolvedValueOnce({
        ok: false,
        statusCode: 190,
        message: "key not found",
      });
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 1, failed: 1 });
  });

  test("switchbotKeyId が null のパスコードは revokeOne が false を返すため failed にカウントされる", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: null, device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentials.mockResolvedValue({
      openToken: "open-token",
      secretKey: "secret-key",
      passcodeBufferMinutes: 15,
    });
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 0, failed: 1 });
  });
});
