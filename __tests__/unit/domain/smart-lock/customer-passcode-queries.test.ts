/**
 * getCustomerVisibleSmartLockPasscodesForReservation の表示条件マトリクス + auth 拒否
 */

import { describe, test, expect, mock, beforeEach } from "bun:test";
import { encrypt } from "@/shared/lib/crypto";
import { PASSCODE_CRYPTO_PURPOSE } from "@/shared/domain/smart-lock/issue-passcode";

const RESERVATION_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";
const OTHER_RESERVATION_ID = "bbbbbbbb-cccc-dddd-eeee-ffffffffffff";
const CUSTOMER_ID = "cccccccc-dddd-eeee-ffff-000000000001";
const OTHER_CUSTOMER_ID = "cccccccc-dddd-eeee-ffff-000000000002";
const DEVICE_ID = "11111111-2222-3333-4444-555555555555";

const START_TIME = new Date("2026-08-01T01:00:00.000Z");
const END_TIME = new Date("2026-08-01T03:00:00.000Z");
/** buffer 15min → window [00:45, 03:15] UTC */
const NOW_IN_WINDOW = new Date("2026-08-01T02:00:00.000Z");
const NOW_BEFORE_WINDOW = new Date("2026-08-01T00:30:00.000Z");
const NOW_AFTER_WINDOW = new Date("2026-08-01T03:30:00.000Z");

type ReservationRow = {
  id: string;
  customerId: string;
  status: string;
  startTime: Date;
  endTime: Date;
  space: {
    smartLockDevice: {
      id: string;
      deviceName: string;
      deviceType: string;
      isActive: boolean;
    } | null;
  };
};

type PasscodeRow = {
  id: string;
  status: string;
  passcodeCiphertext: string;
  device: { id: string; deviceName: string };
};

const mockFindUniqueReservation = mock<
  (...args: unknown[]) => Promise<ReservationRow | null>
>(() => Promise.resolve(null));

const mockFindManyPasscodes = mock<
  (...args: unknown[]) => Promise<PasscodeRow[]>
>(() => Promise.resolve([]));

const mockFindUniqueSwitchbot = mock<
  (...args: unknown[]) => Promise<{
    switchbotEnabled: boolean;
    switchbotPasscodeBufferMinutes: number;
  } | null>
>(() => Promise.resolve(null));

const mockLogError = mock<(...args: unknown[]) => void>(() => undefined);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findUnique: (...args: unknown[]) => mockFindUniqueReservation(...args),
    },
    smartLockPasscode: {
      findMany: (...args: unknown[]) => mockFindManyPasscodes(...args),
    },
    settingsSwitchbot: {
      findUnique: (...args: unknown[]) => mockFindUniqueSwitchbot(...args),
    },
  },
}));

mock.module("@/shared/lib/errors/server", () => ({
  logError: (...args: unknown[]) => mockLogError(...args),
  ErrorCategory: {
    UNKNOWN: "UNKNOWN",
    DATABASE: "DATABASE",
  },
  ErrorSeverity: {
    HIGH: "HIGH",
    LOW: "LOW",
  },
}));

const { getCustomerVisibleSmartLockPasscodesForReservation } =
  await import("@/shared/domain/smart-lock/customer-passcode-queries");

function confirmedReservation(
  overrides: Partial<ReservationRow> = {},
): ReservationRow {
  return {
    id: RESERVATION_ID,
    customerId: CUSTOMER_ID,
    status: "CONFIRMED",
    startTime: START_TIME,
    endTime: END_TIME,
    space: {
      smartLockDevice: {
        id: DEVICE_ID,
        deviceName: "玄関ドア",
        deviceType: "KEYPAD",
        isActive: true,
      },
    },
    ...overrides,
  };
}

function confirmedPasscode(passcode = "123456"): PasscodeRow {
  return {
    id: "passcode-row-1",
    status: "CONFIRMED",
    passcodeCiphertext: encrypt(passcode, {
      purpose: PASSCODE_CRYPTO_PURPOSE,
    }),
    device: { id: DEVICE_ID, deviceName: "玄関ドア" },
  };
}

beforeEach(() => {
  mockFindUniqueReservation.mockReset();
  mockFindManyPasscodes.mockReset();
  mockFindUniqueSwitchbot.mockReset();
  mockLogError.mockReset();

  mockFindUniqueSwitchbot.mockResolvedValue({
    switchbotEnabled: true,
    switchbotPasscodeBufferMinutes: 15,
  });
  mockFindUniqueReservation.mockResolvedValue(confirmedReservation());
  mockFindManyPasscodes.mockResolvedValue([confirmedPasscode()]);
});

describe("getCustomerVisibleSmartLockPasscodesForReservation — auth", () => {
  test("会員: 他人の予約は unauthorized", async () => {
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: OTHER_CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unauthorized" });
    expect(mockFindManyPasscodes).not.toHaveBeenCalled();
  });

  test("ゲスト status-token: rid 不一致は unauthorized", async () => {
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "status-token", reservationId: OTHER_RESERVATION_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unauthorized" });
    expect(mockFindUniqueReservation).not.toHaveBeenCalled();
  });

  test("予約が存在しない場合は unauthorized", async () => {
    mockFindUniqueReservation.mockResolvedValue(null);
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unauthorized" });
  });
});

describe("getCustomerVisibleSmartLockPasscodesForReservation — visibility", () => {
  test("switchbotEnabled=false は unavailable", async () => {
    mockFindUniqueSwitchbot.mockResolvedValue({
      switchbotEnabled: false,
      switchbotPasscodeBufferMinutes: 15,
    });
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unavailable" });
  });

  test("Pad デバイス未割当は unavailable", async () => {
    mockFindUniqueReservation.mockResolvedValue(
      confirmedReservation({
        space: { smartLockDevice: null },
      }),
    );
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unavailable" });
  });

  test("予約 PENDING は unavailable（平文なし）", async () => {
    mockFindUniqueReservation.mockResolvedValue(
      confirmedReservation({ status: "PENDING" }),
    );
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unavailable" });
    expect(mockFindManyPasscodes).not.toHaveBeenCalled();
  });

  test("予約 CANCELLED は unavailable", async () => {
    mockFindUniqueReservation.mockResolvedValue(
      confirmedReservation({ status: "CANCELLED" }),
    );
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "status-token", reservationId: RESERVATION_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unavailable" });
  });

  test("passcode PENDING は pending（平文なし）", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        ...confirmedPasscode(),
        status: "PENDING",
      },
    ]);
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "pending" });
  });

  test("窓前は outside_window（平文なし）", async () => {
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_BEFORE_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "outside_window" });
  });

  test("窓後は outside_window（平文なし）", async () => {
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_AFTER_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "outside_window" });
  });

  test("全条件充足 + reveal で平文を返す", async () => {
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({
      status: "visible",
      revealed: true,
      passcodes: [{ deviceName: "玄関ドア", passcode: "123456" }],
    });
  });

  test("全条件充足でも reveal=false なら平文を含めない", async () => {
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "status-token", reservationId: RESERVATION_ID },
      { now: NOW_IN_WINDOW, reveal: false },
    );
    expect(result).toEqual({
      status: "visible",
      revealed: false,
      deviceNames: ["玄関ドア"],
    });
  });

  test("FAILED passcode のみは unavailable", async () => {
    mockFindManyPasscodes.mockResolvedValue([
      {
        ...confirmedPasscode(),
        status: "FAILED",
      },
    ]);
    const result = await getCustomerVisibleSmartLockPasscodesForReservation(
      RESERVATION_ID,
      { kind: "customer", customerId: CUSTOMER_ID },
      { now: NOW_IN_WINDOW, reveal: true },
    );
    expect(result).toEqual({ status: "unavailable" });
  });
});
