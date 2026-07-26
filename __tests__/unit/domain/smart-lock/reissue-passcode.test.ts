/**
 * completePendingSmartLockReissue / processPendingSmartLockReissues
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindUniqueReservation = mock<
  (...args: unknown[]) => Promise<{
    id: string;
    status: string;
    spaceId: string;
    startTime: Date;
    endTime: Date;
    smartLockReissuePendingAt: Date | null;
  } | null>
>(() => Promise.resolve(null));

const mockFindManyReservations = mock<
  (...args: unknown[]) => Promise<Array<{ id: string }>>
>(() => Promise.resolve([]));

const mockUpdateManyReservation = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));

const mockDeleteManyPasscode = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));

const mockAwaitReservationRevokeConfirmation = mock<
  (...args: unknown[]) => Promise<boolean>
>(() => Promise.resolve(true));

const mockIssueSmartLockPasscodes = mock<
  (...args: unknown[]) => Promise<{
    passcodes: Array<{ deviceName: string; passcode: string }>;
    issuanceFailed: boolean;
  }>
>(() => Promise.resolve({ passcodes: [], issuanceFailed: false }));

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: (...args: unknown[]) => mockFindUniqueReservation(...args),
      findMany: (...args: unknown[]) => mockFindManyReservations(...args),
      updateMany: (...args: unknown[]) => mockUpdateManyReservation(...args),
    },
    smartLockPasscode: {
      deleteMany: (...args: unknown[]) => mockDeleteManyPasscode(...args),
    },
  },
}));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  awaitReservationRevokeConfirmation: (...args: unknown[]) =>
    mockAwaitReservationRevokeConfirmation(...args),
}));

mock.module("@/shared/domain/smart-lock/issue-passcode", () => ({
  issueSmartLockPasscodes: (...args: unknown[]) =>
    mockIssueSmartLockPasscodes(...args),
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  normalizeError: (error: unknown) =>
    error instanceof Error ? error : new Error(String(error)),
  ErrorCategory: { EXTERNAL_API: "EXTERNAL_API" },
  ErrorSeverity: { HIGH: "HIGH" },
}));

mock.module("@/shared/lib/validations/enums/prisma-types", () => ({
  ReservationStatus: { CONFIRMED: "CONFIRMED", CANCELLED: "CANCELLED" },
  SmartLockPasscodeStatus: {
    REVOKED: "REVOKED",
    FAILED: "FAILED",
    PENDING: "PENDING",
  },
}));

const {
  markSmartLockReissuePending,
  completePendingSmartLockReissue,
  processPendingSmartLockReissues,
} = await import("@/shared/domain/smart-lock/reissue-passcode");

const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const SPACE_ID = "space-1";
const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000);
const FUTURE_END = new Date(FUTURE_START.getTime() + 2 * 60 * 60 * 1000);

beforeEach(() => {
  mockFindUniqueReservation.mockReset();
  mockFindManyReservations.mockReset();
  mockUpdateManyReservation.mockReset();
  mockDeleteManyPasscode.mockReset();
  mockAwaitReservationRevokeConfirmation.mockReset();
  mockIssueSmartLockPasscodes.mockReset();
  mockLogError.mockReset();

  mockAwaitReservationRevokeConfirmation.mockResolvedValue(true);
  mockIssueSmartLockPasscodes.mockResolvedValue({
    passcodes: [{ deviceName: "玄関", passcode: "123456" }],
    issuanceFailed: false,
  });
});

describe("markSmartLockReissuePending", () => {
  test("CONFIRMED 予約に pending フラグを立てる", async () => {
    await markSmartLockReissuePending(RESERVATION_ID);

    expect(mockUpdateManyReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: RESERVATION_ID,
          status: "CONFIRMED",
          smartLockReissuePendingAt: null,
        }),
        data: expect.objectContaining({
          smartLockReissuePendingAt: expect.any(Date),
        }),
      }),
    );
  });
});

describe("completePendingSmartLockReissue", () => {
  test("pending フラグが無ければ null を返す", async () => {
    mockFindUniqueReservation.mockResolvedValue(null);

    const result = await completePendingSmartLockReissue(RESERVATION_ID);

    expect(result).toBeNull();
    expect(mockIssueSmartLockPasscodes).not.toHaveBeenCalled();
  });

  test("revoke 未確認なら createKey せず null を返す", async () => {
    mockFindUniqueReservation.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      spaceId: SPACE_ID,
      startTime: FUTURE_START,
      endTime: FUTURE_END,
      smartLockReissuePendingAt: new Date(),
    });
    mockAwaitReservationRevokeConfirmation.mockResolvedValue(false);

    const result = await completePendingSmartLockReissue(RESERVATION_ID);

    expect(result).toBeNull();
    expect(mockDeleteManyPasscode).not.toHaveBeenCalled();
    expect(mockIssueSmartLockPasscodes).not.toHaveBeenCalled();
    expect(mockUpdateManyReservation).not.toHaveBeenCalled();
  });

  test("revoke 確認後に terminal 行を DELETE して issue し pending をクリアする", async () => {
    mockFindUniqueReservation.mockResolvedValue({
      id: RESERVATION_ID,
      status: "CONFIRMED",
      spaceId: SPACE_ID,
      startTime: FUTURE_START,
      endTime: FUTURE_END,
      smartLockReissuePendingAt: new Date(),
    });

    const result = await completePendingSmartLockReissue(RESERVATION_ID);

    expect(mockAwaitReservationRevokeConfirmation).toHaveBeenCalledWith(
      RESERVATION_ID,
    );
    expect(mockDeleteManyPasscode).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservationId: RESERVATION_ID,
          status: { in: ["REVOKED", "FAILED", "PENDING"] },
        }),
      }),
    );
    expect(mockIssueSmartLockPasscodes).toHaveBeenCalledWith({
      reservationId: RESERVATION_ID,
      spaceId: SPACE_ID,
      startTime: FUTURE_START,
      endTime: FUTURE_END,
    });
    expect(mockUpdateManyReservation).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: RESERVATION_ID },
        data: { smartLockReissuePendingAt: null },
      }),
    );
    expect(result?.passcodes).toHaveLength(1);
  });
});

describe("processPendingSmartLockReissues", () => {
  test("pending 予約が無ければ attempted=0", async () => {
    mockFindManyReservations.mockResolvedValue([]);

    const stats = await processPendingSmartLockReissues(new Date());

    expect(stats).toEqual({ attempted: 0, completed: 0, failed: 0 });
  });
});
