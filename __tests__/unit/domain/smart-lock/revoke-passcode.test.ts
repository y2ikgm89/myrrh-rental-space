/**
 * revokeOne / revokeSmartLockPasscodesForReservation / revokeExpiredSmartLockPasscodes /
 * confirmRevokeByKeyAbsence / expireStaleRevokePending のテスト
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockUpdateMany = mock<(...args: unknown[]) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 1 }),
);

const mockFindMany = mock<
  (...args: unknown[]) => Promise<
    Array<{
      id: string;
      switchbotKeyId: string | null;
      device: { deviceId: string };
      reservationId?: string;
    }>
  >
>(() => Promise.resolve([]));

const mockDeletePasscode = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { commandId?: string } | Record<string, never> }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: {} }));

const mockFindKeyByIdInDeviceList = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { id: string } | null }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: { id: "still-present" } }));

const mockGetDecryptedSwitchBotCredentialsForRevocation = mock<
  () => Promise<{ openToken: string; secretKey: string } | null>
>(() => Promise.resolve(null));

const mockFindKeyInDeviceList = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { id: string } | null }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: null }));

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);
const mockCreateNotification = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockPasscode: {
      findMany: (...args: unknown[]) => mockFindMany(...args),
      updateMany: (...args: unknown[]) => mockUpdateMany(...args),
    },
  },
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentialsForRevocation: () =>
    mockGetDecryptedSwitchBotCredentialsForRevocation(),
}));

mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  buildPasscodeName: (reservationId: string, deviceId: string) =>
    `res-${reservationId}-${deviceId}`,
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  deletePasscode: (...args: unknown[]) => mockDeletePasscode(...args),
  findKeyByIdInDeviceList: (...args: unknown[]) =>
    mockFindKeyByIdInDeviceList(...args),
  findKeyInDeviceList: (...args: unknown[]) => mockFindKeyInDeviceList(...args),
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
    REVOKE_PENDING: "REVOKE_PENDING",
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
  createNotificationCommand: (args: unknown) => mockCreateNotification(args),
}));

mock.module("@/shared/lib/async-utils", () => ({
  fireAndForget: (promise: Promise<unknown>) => {
    void promise;
  },
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
  confirmRevokeByKeyAbsence,
  expireStaleRevokePendingSmartLockPasscodes,
  expireStalePendingSmartLockPasscodes,
  recoverPendingPasscodeViaDeviceList,
  STALE_PENDING_THRESHOLD_MINUTES,
} = await import("@/shared/domain/smart-lock/revoke-passcode");

const CREDENTIALS = { openToken: "open-token", secretKey: "secret-key" };
const DEVICE = { deviceId: "AA:BB:CC:DD:EE:FF" };

describe("revokeOne", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockDeletePasscode.mockReset();
    mockFindKeyByIdInDeviceList.mockReset();
    mockLogError.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockDeletePasscode.mockResolvedValue({ ok: true, body: {} });
    mockFindKeyByIdInDeviceList.mockResolvedValue({
      ok: true,
      body: { id: "still-present" },
    });
  });

  test("switchbotKeyId が null の場合は false を返し logError を呼ぶ", async () => {
    const passcode = { id: "pcode-1", switchbotKeyId: null, device: DEVICE };
    const result = await revokeOne(CREDENTIALS, passcode);
    expect(result).toBe(false);
    expect(mockLogError).toHaveBeenCalledTimes(1);
    expect(mockDeletePasscode).not.toHaveBeenCalled();
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("deletePasscode が失敗 (ok: false) の場合は false を返し updateMany しない", async () => {
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
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("deletePasscode 成功時は CONFIRMED → REVOKE_PENDING に updateMany する", async () => {
    mockDeletePasscode.mockResolvedValue({
      ok: true,
      body: { commandId: "del-cmd-1" },
    });
    const passcode = {
      id: "pcode-3",
      switchbotKeyId: "key-abc",
      device: DEVICE,
    };
    const result = await revokeOne(CREDENTIALS, passcode);
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "pcode-3",
          status: { in: ["CONFIRMED", "PENDING"] },
        },
        data: expect.objectContaining({
          status: "REVOKE_PENDING",
          switchbotDeleteCommandId: "del-cmd-1",
          revokeRequestedAt: expect.any(Date),
        }),
      }),
    );
    expect(mockLogError).not.toHaveBeenCalled();
  });

  test("commandId 無しの空 body でも REVOKE_PENDING に遷移する", async () => {
    mockDeletePasscode.mockResolvedValue({ ok: true, body: {} });
    const passcode = {
      id: "pcode-empty-body",
      switchbotKeyId: "key-abc",
      device: DEVICE,
    };
    await revokeOne(CREDENTIALS, passcode);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "REVOKE_PENDING",
          revokeRequestedAt: expect.any(Date),
        }),
      }),
    );
    const firstCall = mockUpdateMany.mock.calls[0];
    if (!firstCall) throw new Error("updateMany not called");
    const data = (firstCall[0] as { data: Record<string, unknown> }).data;
    expect(data["switchbotDeleteCommandId"]).toBeUndefined();
  });
});

describe("confirmRevokeByKeyAbsence", () => {
  beforeEach(() => {
    mockUpdateMany.mockReset();
    mockFindKeyByIdInDeviceList.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 1 });
    mockFindKeyByIdInDeviceList.mockResolvedValue({ ok: true, body: null });
  });

  test("key が Device List に無ければ REVOKED に更新する", async () => {
    const passcode = {
      id: "p1",
      switchbotKeyId: "key-1",
      device: DEVICE,
    };
    const result = await confirmRevokeByKeyAbsence(CREDENTIALS, passcode);
    expect(result).toBe(true);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: "p1", status: "REVOKE_PENDING" },
        data: expect.objectContaining({ status: "REVOKED" }),
      }),
    );
  });

  test("key がまだ存在する場合は false", async () => {
    mockFindKeyByIdInDeviceList.mockResolvedValue({
      ok: true,
      body: { id: "key-1" },
    });
    const result = await confirmRevokeByKeyAbsence(CREDENTIALS, {
      id: "p1",
      switchbotKeyId: "key-1",
      device: DEVICE,
    });
    expect(result).toBe(false);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("expireStaleRevokePendingSmartLockPasscodes", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
    mockCreateNotification.mockReset();
    mockUpdateMany.mockResolvedValue({ count: 0 });
    mockFindMany.mockResolvedValue([]);
  });

  test("revokeRequestedAt cutoff で REVOKE_PENDING を CONFIRMED に戻す", async () => {
    const now = new Date("2027-06-15T12:00:00Z");
    mockFindMany.mockResolvedValue([
      {
        id: "p1",
        reservationId: "res-1",
        switchbotKeyId: "k1",
        device: DEVICE,
      },
    ]);
    mockUpdateMany.mockResolvedValue({ count: 1 });

    const result = await expireStaleRevokePendingSmartLockPasscodes(now);

    expect(result).toBe(1);
    const call = mockUpdateMany.mock.calls[0];
    if (!call) throw new Error("updateMany not called");
    const args = call[0] as {
      where: {
        status: string;
        revokeRequestedAt: { lt: Date };
      };
      data: { status: string };
    };
    expect(args.where.status).toBe("REVOKE_PENDING");
    const expectedCutoffMs =
      now.getTime() - STALE_PENDING_THRESHOLD_MINUTES * 60 * 1000;
    expect(args.where.revokeRequestedAt.lt.getTime()).toBe(expectedCutoffMs);
    expect(args.data.status).toBe("CONFIRMED");
  });

  test("stale 0 件なら 0 を返し updateMany しない", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await expireStaleRevokePendingSmartLockPasscodes(new Date());
    expect(result).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});

describe("revokeSmartLockPasscodesForReservation", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockReset();
    mockDeletePasscode.mockReset();
    mockUpdateMany.mockReset();
    mockLogError.mockReset();
    mockDeletePasscode.mockResolvedValue({ ok: true, body: {} });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("CONFIRMED パスコードが 0 件の場合は credentials 取得も API 呼出もしない", async () => {
    mockFindMany.mockResolvedValue([]);
    await revokeSmartLockPasscodesForReservation("res-1");
    expect(
      mockGetDecryptedSwitchBotCredentialsForRevocation,
    ).not.toHaveBeenCalled();
    expect(mockDeletePasscode).not.toHaveBeenCalled();
  });
});

describe("revokeExpiredSmartLockPasscodes", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockReset();
    mockDeletePasscode.mockReset();
    mockUpdateMany.mockReset();
    mockDeletePasscode.mockResolvedValue({ ok: true, body: {} });
    mockUpdateMany.mockResolvedValue({ count: 1 });
  });

  test("失効候補が 0 件の場合は { revoked: 0, failed: 0 } を返す", async () => {
    mockFindMany.mockResolvedValue([]);
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 0, failed: 0 });
  });

  test("全件成功の場合は { revoked: N, failed: 0 } を返す", async () => {
    mockFindMany.mockResolvedValue([
      { id: "p1", switchbotKeyId: "key-1", device: DEVICE },
      { id: "p2", switchbotKeyId: "key-2", device: DEVICE },
    ]);
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue({
      openToken: "open-token",
      secretKey: "secret-key",
    });
    const result = await revokeExpiredSmartLockPasscodes(new Date());
    expect(result).toEqual({ revoked: 2, failed: 0 });
  });
});
