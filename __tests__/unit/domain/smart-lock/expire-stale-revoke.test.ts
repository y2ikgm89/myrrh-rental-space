/**
 * `expireStaleRevokePendingSmartLockPasscodes` の contract test。
 */

import { describe, expect, test, mock, beforeEach } from "bun:test";

type UpdateManyResult = { count: number };
type MockArgs = Record<string, unknown> | undefined;

const mockUpdateMany = mock<(args?: MockArgs) => Promise<UpdateManyResult>>(
  () => Promise.resolve({ count: 0 }),
);
const mockFindMany = mock<
  (args?: MockArgs) => Promise<Array<{ id: string; reservationId: string }>>
>(() => Promise.resolve([]));
const mockCreateNotification = mock<(args: unknown) => Promise<unknown>>(() =>
  Promise.resolve(),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    smartLockPasscode: {
      findMany: (args?: MockArgs) => mockFindMany(args),
      updateMany: (args?: MockArgs) => mockUpdateMany(args),
    },
  },
}));

mock.module("@/shared/domain/settings/api-key-queries", () => ({
  getDecryptedSwitchBotCredentialsForRevocation: () => Promise.resolve(null),
}));

mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  buildPasscodeName: (reservationId: string, deviceId: string) =>
    `res-${reservationId}-${deviceId}`,
}));

mock.module("@/shared/lib/smart-lock/switchbot-client", () => ({
  deletePasscode: () => Promise.resolve({ ok: true, body: {} }),
  findKeyByIdInDeviceList: () =>
    Promise.resolve({ ok: true, body: { id: "present" } }),
  findKeyInDeviceList: () => Promise.resolve({ ok: true, body: null }),
  createPasscode: () => Promise.resolve({ ok: true, body: { commandId: "x" } }),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: () => undefined,
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { MEDIUM: "MEDIUM" },
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
}));

const {
  expireStaleRevokePendingSmartLockPasscodes,
  STALE_PENDING_THRESHOLD_MINUTES,
} = await import("@/shared/domain/smart-lock/revoke-passcode");

describe("expireStaleRevokePendingSmartLockPasscodes", () => {
  beforeEach(() => {
    mockUpdateMany.mockClear();
    mockFindMany.mockClear();
    mockCreateNotification.mockClear();
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    mockFindMany.mockImplementation(() =>
      Promise.resolve([{ id: "p1", reservationId: "res-1" }]),
    );
  });

  test("cutoff = now - STALE_PENDING_THRESHOLD_MINUTES で REVOKE_PENDING のみ CONFIRMED に戻す", async () => {
    const now = new Date("2027-06-15T12:00:00Z");
    await expireStaleRevokePendingSmartLockPasscodes(now);

    const call = mockUpdateMany.mock.calls[0];
    if (!call) throw new Error("updateMany was not called");
    const args = call[0] as {
      where: { status: string; revokeRequestedAt: { lt: Date } };
      data: {
        status: string;
        switchbotDeleteCommandId: null;
        revokeRequestedAt: null;
      };
    };

    expect(args.where.status).toBe("REVOKE_PENDING");
    const expectedCutoffMs =
      now.getTime() - STALE_PENDING_THRESHOLD_MINUTES * 60 * 1000;
    expect(args.where.revokeRequestedAt.lt.getTime()).toBe(expectedCutoffMs);
    expect(args.data.status).toBe("CONFIRMED");
    expect(args.data.switchbotDeleteCommandId).toBeNull();
    expect(args.data.revokeRequestedAt).toBeNull();
  });

  test("対象 0 件でも 0 を返す", async () => {
    mockFindMany.mockImplementation(() => Promise.resolve([]));
    const result = await expireStaleRevokePendingSmartLockPasscodes(new Date());
    expect(result).toBe(0);
    expect(mockUpdateMany).not.toHaveBeenCalled();
  });

  test("count が snapshot と一致すれば post-update findMany は skip する", async () => {
    mockFindMany.mockImplementation(() =>
      Promise.resolve([
        { id: "p1", reservationId: "r1" },
        { id: "p2", reservationId: "r2" },
      ]),
    );
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 2 }));

    await expireStaleRevokePendingSmartLockPasscodes(new Date());

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    expect(mockCreateNotification).toHaveBeenCalledTimes(2);
  });
});
