/**
 * `expireStalePendingSmartLockPasscodes` の contract test。
 *
 * stale PENDING は Device List に live key がある場合:
 * CONFIRMED 予約かつ未期限切れは confirm、CANCELLED / 期限切れのみ deleteKey。
 * key が無い場合のみ FAILED に倒す。
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";

type UpdateManyResult = { count: number };
type MockArgs = Record<string, unknown> | undefined;

const mockUpdateMany = mock<(args?: MockArgs) => Promise<UpdateManyResult>>(
  () => Promise.resolve({ count: 0 }),
);
const mockFindMany = mock<
  (args?: MockArgs) => Promise<
    Array<{
      id: string;
      reservationId: string;
      deviceId: string;
      switchbotKeyId: string | null;
      endTime: Date;
      device: { deviceId: string };
      reservation: { status: string };
    }>
  >
>(() => Promise.resolve([]));

const mockGetDecryptedSwitchBotCredentialsForRevocation = mock<
  () => Promise<{ openToken: string; secretKey: string } | null>
>(() => Promise.resolve(null));

const mockDeletePasscode = mock<
  () => Promise<{ ok: true; body: { commandId?: string } }>
>(() => Promise.resolve({ ok: true, body: { commandId: "del-1" } }));

const mockFindKeyInDeviceList = mock<
  (
    ...args: unknown[]
  ) => Promise<
    | { ok: true; body: { id: string } | null }
    | { ok: false; statusCode: number; message: string }
  >
>(() => Promise.resolve({ ok: true, body: null }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockPasscode: {
      findMany: (args?: MockArgs) => mockFindMany(args),
      updateMany: (args?: MockArgs) => mockUpdateMany(args),
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
  deletePasscode: () => mockDeletePasscode(),
  findKeyByIdInDeviceList: () =>
    Promise.resolve({ ok: true, body: { id: "present" } }),
  findKeyInDeviceList: (...args: unknown[]) => mockFindKeyInDeviceList(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: () => undefined,
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

const mockCreateNotification = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve(),
);
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
}));

const {
  expireStalePendingSmartLockPasscodes,
  STALE_PENDING_THRESHOLD_MINUTES,
} = await import("@/shared/domain/smart-lock/revoke-passcode");

describe("STALE_PENDING_THRESHOLD_MINUTES", () => {
  test("poll timeout (45s) より十分に長い閾値である (race 防止の下限)", () => {
    expect(STALE_PENDING_THRESHOLD_MINUTES).toBeGreaterThanOrEqual(10);
  });

  test("SwitchBot webhook の実運用遅延を許容する現行値: 30 分", () => {
    expect(STALE_PENDING_THRESHOLD_MINUTES).toBe(30);
  });
});

describe("expireStalePendingSmartLockPasscodes", () => {
  beforeEach(() => {
    mockUpdateMany.mockClear();
    mockFindMany.mockClear();
    mockCreateNotification.mockClear();
    mockFindKeyInDeviceList.mockClear();
    mockDeletePasscode.mockClear();
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockClear();

    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 1 }));
    mockFindMany.mockImplementation(() =>
      Promise.resolve([
        {
          id: "pcode-1",
          reservationId: "res-1",
          deviceId: "dev-1",
          switchbotKeyId: null,
          endTime: new Date("2027-12-31T00:00:00Z"),
          device: { deviceId: "AA:BB" },
          reservation: { status: "CONFIRMED" },
        },
      ]),
    );
    mockGetDecryptedSwitchBotCredentialsForRevocation.mockResolvedValue({
      openToken: "token",
      secretKey: "secret",
    });
    mockFindKeyInDeviceList.mockResolvedValue({ ok: true, body: null });
  });

  test("Device List に key が無ければ PENDING を FAILED に倒す", async () => {
    const now = new Date("2027-06-15T12:00:00Z");
    const result = await expireStalePendingSmartLockPasscodes(now);

    expect(result).toBe(1);
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING", id: "pcode-1" }),
        data: expect.objectContaining({ status: "FAILED" }),
      }),
    );
    expect(mockCreateNotification).toHaveBeenCalledTimes(1);
  });

  test("CONFIRMED 予約の stale PENDING は Device List に key があれば CONFIRMED し deleteKey しない", async () => {
    mockFindKeyInDeviceList.mockResolvedValue({
      ok: true,
      body: { id: "live-key" },
    });

    const result = await expireStalePendingSmartLockPasscodes(
      new Date("2027-06-15T12:00:00Z"),
    );

    expect(result).toBe(0);
    expect(mockDeletePasscode).not.toHaveBeenCalled();
    expect(mockUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PENDING", id: "pcode-1" }),
        data: expect.objectContaining({
          status: "CONFIRMED",
          switchbotKeyId: "live-key",
        }),
      }),
    );
  });

  test("CANCELLED 予約の stale PENDING は Device List に key があれば deleteKey する", async () => {
    mockFindMany.mockImplementation(() =>
      Promise.resolve([
        {
          id: "pcode-1",
          reservationId: "res-1",
          deviceId: "dev-1",
          switchbotKeyId: null,
          endTime: new Date("2027-12-31T00:00:00Z"),
          device: { deviceId: "AA:BB" },
          reservation: { status: "CANCELLED" },
        },
      ]),
    );
    mockFindKeyInDeviceList.mockResolvedValue({
      ok: true,
      body: { id: "live-key" },
    });

    const result = await expireStalePendingSmartLockPasscodes(new Date());

    expect(result).toBe(0);
    expect(mockDeletePasscode).toHaveBeenCalled();
    expect(
      mockUpdateMany.mock.calls.some(
        (call) =>
          (call[0] as { data?: { status?: string } })?.data?.status ===
          "FAILED",
      ),
    ).toBe(false);
  });

  test("対象 0 件なら 0 を返す", async () => {
    mockFindMany.mockImplementation(() => Promise.resolve([]));

    const result = await expireStalePendingSmartLockPasscodes(new Date());

    expect(result).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });
});
