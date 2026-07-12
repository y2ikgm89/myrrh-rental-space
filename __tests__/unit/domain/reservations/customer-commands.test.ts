import { describe, test, expect, mock, beforeEach } from "bun:test";

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

const mockSpaceFindUniqueOuter = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    locationId: "loc-1",
  }),
);
const mockSpaceFindUniqueTx = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "space-1",
    locationId: "loc-1",
    hourlyPrice: 1000,
    discountType: "none",
    discountValue: null,
    durationDiscountOverride: "use_global",
  }),
);
const mockBlockedDateFindFirst = mock<
  () => Promise<{ reason: string | null } | null>
>(() => Promise.resolve(null));
const mockTxReservationFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "res-1",
    status: ReservationStatus.CONFIRMED,
    // 30 日以上先の startTime。isWithinDeadline (24h) を通過するため
    // beforeEach で `future` を代入する。ここは placeholder。
    startTime: new Date("2099-01-01T00:00:00Z"),
    taxRateType: "STANDARD",
    taxRate: 0.1,
    couponId: null,
    coupon: null,
  }),
);
const mockReservationUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ id: "res-1" }),
);
const mockSettingsFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "best",
  }),
);
const mockExecuteRaw = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockReservationRuleSettings = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    minMinutes: 60,
    maxMinutes: 480,
  }),
);

const mockCheckReservationOverlap = mock<
  () => Promise<{ hasOverlap: boolean }>
>(() => Promise.resolve({ hasOverlap: false }));

const txClient = {
  reservation: {
    findFirst: mockTxReservationFindFirst,
    update: mockReservationUpdate,
  },
  space: { findUnique: mockSpaceFindUniqueTx },
  settings: { findFirst: mockSettingsFindFirst },
  blockedDate: { findFirst: mockBlockedDateFindFirst },
  $executeRaw: mockExecuteRaw,
};

const mockTransaction = mock<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClient));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: { findUnique: mockSpaceFindUniqueOuter },
    blockedDate: { findFirst: mockBlockedDateFindFirst },
    $transaction: mockTransaction,
  },
}));

mock.module("@/shared/lib/reservation", () => ({
  checkReservationOverlap: mockCheckReservationOverlap,
}));

mock.module("@/shared/domain/reservations/availability", () => ({
  ensureDateNotBlocked: mock(
    async (spaceId: string, locationId: string, date: string, tx?: unknown) => {
      // 実装と同じ「blockedDate.findFirst → blocked なら throw」を再現
      const client = (tx ?? {
        blockedDate: { findFirst: mockBlockedDateFindFirst },
      }) as { blockedDate: { findFirst: typeof mockBlockedDateFindFirst } };
      const blocked = await client.blockedDate.findFirst();
      if (blocked) {
        const { DomainError } = await import("@/shared/domain/domain-error");
        throw new DomainError(
          blocked.reason
            ? `選択された日付は休業日です（${blocked.reason}）。別の日付をお選びください。`
            : "選択された日付は休業日です。別の日付をお選びください。",
          "CONFLICT",
        );
      }
    },
  ),
  getReservationRuleSettings: mockReservationRuleSettings,
}));

// 変更期限 gate (isWithinDeadline) を通すため、reservationDeadlineNow を固定して
// mockTxReservationFindFirst の startTime を十分未来にする
mock.module("@/shared/domain/reservations/server-deadline-instant", () => ({
  reservationDeadlineNow: () => new Date("2026-01-01T00:00:00Z"),
}));

import { updateCustomerReservation } from "@/shared/domain/reservations/customer-commands";

describe("updateCustomerReservation — BlockedDate guard (PR#2)", () => {
  beforeEach(() => {
    mockSpaceFindUniqueOuter.mockClear();
    mockSpaceFindUniqueTx.mockClear();
    mockBlockedDateFindFirst.mockClear();
    mockTxReservationFindFirst.mockClear();
    mockReservationUpdate.mockClear();
    mockCheckReservationOverlap.mockClear();

    // reset to default (not blocked)
    mockBlockedDateFindFirst.mockImplementation(() => Promise.resolve(null));

    // reset space mocks to default
    mockSpaceFindUniqueOuter.mockImplementation(() =>
      Promise.resolve({ locationId: "loc-1" }),
    );
    mockSpaceFindUniqueTx.mockImplementation(() =>
      Promise.resolve({
        id: "space-1",
        locationId: "loc-1",
        hourlyPrice: 1000,
        discountType: "none",
        discountValue: null,
        durationDiscountOverride: "use_global",
      }),
    );

    // 十分未来の予約 (isWithinDeadline を通過)
    mockTxReservationFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.CONFIRMED,
        paymentStatus: "UNPAID",
        startTime: new Date("2026-12-01T02:00:00Z"), // JST 11:00
        taxRateType: "STANDARD",
        taxRate: 0.1,
        couponId: null,
        coupon: null,
      }),
    );
  });

  const validInput = {
    spaceId: "space-1",
    date: "2026-12-15",
    startTime: "10:00",
    endTime: "12:00",
  };

  test("blocked date の場合 tx 外 pre-check で DomainError(CONFLICT) を throw する (reservation.update 未呼出)", async () => {
    mockBlockedDateFindFirst.mockImplementation(() =>
      Promise.resolve({ reason: "年末年始" }),
    );

    await expect(
      updateCustomerReservation("res-1", "cust-1", validInput, 24),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("blocked でなければ通常フロー (reservation.update 呼出) に進む", async () => {
    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect(result).toEqual({
      success: true,
      payload: { reservationId: "res-1" },
    });
    expect(mockReservationUpdate).toHaveBeenCalledTimes(1);
    // blocked date は tx 外 pre-check と tx 内二重ガードで 2 回呼ばれる
    expect(mockBlockedDateFindFirst).toHaveBeenCalledTimes(2);
  });

  test("PAID の予約は変更不可 (キャンセル+再予約に誘導、reservation.update 未呼出) — PR#13", async () => {
    mockTxReservationFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.CONFIRMED,
        paymentStatus: "PAID",
        startTime: new Date("2026-12-01T02:00:00Z"),
        taxRateType: "STANDARD",
        taxRate: 0.1,
        couponId: null,
        coupon: null,
      }),
    );

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect(result).toEqual({
      success: false,
      error:
        "決済処理が開始された予約は変更できません。キャンセル後に新規予約をお願いいたします。",
    });
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("PENDING 決済中の予約も変更不可 (checkout session 生成中の中断防止) — PR#13", async () => {
    mockTxReservationFindFirst.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.CONFIRMED,
        paymentStatus: "PENDING",
        startTime: new Date("2026-12-01T02:00:00Z"),
        taxRateType: "STANDARD",
        taxRate: 0.1,
        couponId: null,
        coupon: null,
      }),
    );

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect((result as { success: false; error: string }).success).toBe(false);
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });

  test("spaceForBlockedCheck が見つからない場合 (削除済み/非公開) は 早期 return", async () => {
    mockSpaceFindUniqueOuter.mockImplementation(() => Promise.resolve(null));

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      validInput,
      24,
    );

    expect(result).toEqual({
      success: false,
      error: "指定されたスペースが見つかりません",
    });
    expect(mockBlockedDateFindFirst).not.toHaveBeenCalled();
    expect(mockReservationUpdate).not.toHaveBeenCalled();
  });
});
