/**
 * applyReservationEditSideEffects — SwitchBot passcode reissue on datetime/space change
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindUniqueReservation = mock<
  (...args: unknown[]) => Promise<{ status: string; startTime: Date } | null>
>(() => Promise.resolve(null));
const mockFindUniqueSpace = mock<
  (...args: unknown[]) => Promise<{ smartLockDeviceId: string | null } | null>
>(() => Promise.resolve(null));
const mockDeleteManyPasscode = mock<
  (...args: unknown[]) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));

const mockRevokeSmartLockPasscodesForReservation = mock<
  (...args: unknown[]) => Promise<void>
>(() => Promise.resolve());

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
    },
    space: {
      findUnique: (...args: unknown[]) => mockFindUniqueSpace(...args),
    },
    smartLockPasscode: {
      deleteMany: (...args: unknown[]) => mockDeleteManyPasscode(...args),
    },
  },
}));

const mockAwaitReservationRevokeConfirmation = mock<
  (...args: unknown[]) => Promise<boolean>
>(() => Promise.resolve(true));

mock.module("@/shared/domain/smart-lock/revoke-passcode", () => ({
  revokeSmartLockPasscodesForReservation: (...args: unknown[]) =>
    mockRevokeSmartLockPasscodesForReservation(...args),
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

const { applyReservationEditSideEffects } =
  await import("@/shared/domain/reservations/edit-side-effects");

const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OLD_SPACE_ID = "space-old";
const NEW_SPACE_ID = "space-new";
const DEVICE_ID = "device-row-1";
const FUTURE_START = new Date(Date.now() + 24 * 60 * 60 * 1000);
const FUTURE_END = new Date(FUTURE_START.getTime() + 2 * 60 * 60 * 1000);

function makeInput(overrides?: {
  oldStartTime?: Date;
  newStartTime?: Date;
  oldSpaceId?: string;
  newSpaceId?: string;
}) {
  return {
    reservationId: RESERVATION_ID,
    oldSpaceId: overrides?.oldSpaceId ?? OLD_SPACE_ID,
    oldStartTime: overrides?.oldStartTime ?? FUTURE_START,
    oldEndTime: FUTURE_END,
    newSpaceId: overrides?.newSpaceId ?? NEW_SPACE_ID,
    newStartTime:
      overrides?.newStartTime ?? new Date(FUTURE_START.getTime() + 3_600_000),
    newEndTime: new Date(FUTURE_END.getTime() + 3_600_000),
  };
}

beforeEach(() => {
  mockFindUniqueReservation.mockReset();
  mockFindUniqueSpace.mockReset();
  mockDeleteManyPasscode.mockReset();
  mockRevokeSmartLockPasscodesForReservation.mockReset();
  mockAwaitReservationRevokeConfirmation.mockReset();
  mockIssueSmartLockPasscodes.mockReset();
  mockLogError.mockReset();

  mockFindUniqueReservation.mockResolvedValue({
    status: "CONFIRMED",
    startTime: FUTURE_START,
  });
  mockFindUniqueSpace.mockImplementation((...args: unknown[]) => {
    const arg = args[0] as { where?: { id?: string } } | undefined;
    const spaceId = arg?.where?.id;
    return Promise.resolve({
      smartLockDeviceId:
        spaceId === OLD_SPACE_ID || spaceId === NEW_SPACE_ID ? DEVICE_ID : null,
    });
  });
  mockAwaitReservationRevokeConfirmation.mockResolvedValue(true);
  mockIssueSmartLockPasscodes.mockResolvedValue({
    passcodes: [{ deviceName: "玄関", passcode: "123456" }],
    issuanceFailed: false,
  });
});

describe("applyReservationEditSideEffects", () => {
  test("日時/スペース変更なしは no-op", async () => {
    const start = FUTURE_START;
    const end = FUTURE_END;
    const result = await applyReservationEditSideEffects({
      reservationId: RESERVATION_ID,
      oldSpaceId: OLD_SPACE_ID,
      oldStartTime: start,
      oldEndTime: end,
      newSpaceId: OLD_SPACE_ID,
      newStartTime: start,
      newEndTime: end,
    });

    expect(result).toEqual({ passcodes: [], issuanceFailed: false });
    expect(mockRevokeSmartLockPasscodesForReservation).not.toHaveBeenCalled();
    expect(mockIssueSmartLockPasscodes).not.toHaveBeenCalled();
  });

  test("同一 device への再発行は revoke 確認後に terminal 行を DELETE して issue する", async () => {
    const result = await applyReservationEditSideEffects(makeInput());

    expect(mockRevokeSmartLockPasscodesForReservation).toHaveBeenCalledWith(
      RESERVATION_ID,
    );
    expect(mockAwaitReservationRevokeConfirmation).toHaveBeenCalledWith(
      RESERVATION_ID,
    );
    expect(mockDeleteManyPasscode).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          reservationId: RESERVATION_ID,
          status: {
            in: ["REVOKED", "FAILED", "PENDING"],
          },
        }),
      }),
    );
    expect(mockIssueSmartLockPasscodes).toHaveBeenCalledTimes(1);
    expect(result.passcodes).toHaveLength(1);
  });

  test("revoke 未確認の場合は issuanceFailed を返し DELETE/issue しない", async () => {
    mockAwaitReservationRevokeConfirmation.mockResolvedValue(false);

    const result = await applyReservationEditSideEffects(makeInput());

    expect(result).toEqual({ passcodes: [], issuanceFailed: true });
    expect(mockDeleteManyPasscode).not.toHaveBeenCalled();
    expect(mockIssueSmartLockPasscodes).not.toHaveBeenCalled();
  });

  test("別 device への space 変更は REVOKE_PENDING 行を DELETE しない", async () => {
    mockFindUniqueSpace.mockImplementation((...args: unknown[]) => {
      const arg = args[0] as { where?: { id?: string } } | undefined;
      const spaceId = arg?.where?.id;
      return Promise.resolve({
        smartLockDeviceId:
          spaceId === OLD_SPACE_ID ? "device-old" : "device-new",
      });
    });

    await applyReservationEditSideEffects(makeInput());

    expect(mockRevokeSmartLockPasscodesForReservation).toHaveBeenCalled();
    expect(mockDeleteManyPasscode).not.toHaveBeenCalled();
    expect(mockIssueSmartLockPasscodes).toHaveBeenCalledTimes(1);
  });
});
