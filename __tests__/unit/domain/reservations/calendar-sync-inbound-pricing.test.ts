import { beforeEach, describe, expect, mock, test } from "bun:test";

const PaymentStatus = {
  UNPAID: "UNPAID",
  PENDING: "PENDING",
} as const;

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
} as const;

const mockReservationFindFirstOuter = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve(null));

const mockReservationFindFirstTx = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() =>
  Promise.resolve({
    id: "res-1",
    taxRate: 10,
    coupon: null,
  }),
);

const mockReservationFindUniqueTx = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ couponId: null }));

const mockReservationUpdate = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() => Promise.resolve({ id: "res-1" }));

const mockReservationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));

const mockSpaceFindUniqueTx = mock<
  (args: Record<string, unknown>) => Promise<unknown>
>(() =>
  Promise.resolve({
    hourlyPrice: 2000,
    discountType: "none",
    discountValue: null,
    durationDiscountOverride: "use_global",
    taxRateType: "standard",
  }),
);

const mockCouponUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockExecuteRaw = mock<() => Promise<number>>(() => Promise.resolve(0));

const mockCheckSpaceOverlap = mock<
  () => Promise<
    | { hasOverlap: false }
    | {
        hasOverlap: true;
        type: "reservation" | "event";
        conflictId: string;
        startTime: Date;
        endTime: Date;
      }
  >
>(() => Promise.resolve({ hasOverlap: false }));

const mockGetSpaceRatePlans = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

const mockGetReservationSettings = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "best",
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "tax_included",
    showOriginalPrice: true,
  }),
);

const mockExpireOpenCheckoutSessionBestEffort = mock<
  (args: Record<string, unknown>) => Promise<void>
>(() => Promise.resolve());

const txClient = {
  reservation: {
    findFirst: mockReservationFindFirstTx,
    findUnique: mockReservationFindUniqueTx,
    update: mockReservationUpdate,
    updateMany: mockReservationUpdateMany,
  },
  space: {
    findUnique: mockSpaceFindUniqueTx,
  },
  coupon: {
    updateMany: mockCouponUpdateMany,
  },
  $executeRaw: mockExecuteRaw,
};

const mockTransaction = mock<
  (fn: (tx: typeof txClient) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClient));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    reservation: {
      findFirst: mockReservationFindFirstOuter,
    },
    $transaction: mockTransaction,
  },
}));

mock.module("@/shared/domain/reservations/space-locks", () => ({
  lockSpaceForTransaction: mock(async () => undefined),
}));

mock.module("@/shared/domain/spaces/overlap", () => ({
  checkSpaceOverlap: mockCheckSpaceOverlap,
}));

mock.module("@/shared/domain/spaces/rate-plan-queries", () => ({
  getSpaceRatePlans: mockGetSpaceRatePlans,
}));

mock.module("@/shared/domain/reservations/payloads", () => ({
  getReservationSettings: mockGetReservationSettings,
  buildPricingSettings: (settings: {
    taxStandardRate?: number;
    taxReducedRate?: number;
    taxDisplayModePublic?: string;
    durationDiscountEnabled?: boolean;
    durationDiscountRules?: unknown;
    discountCombinationMode?: string;
    showOriginalPrice?: boolean;
  }) => ({
    taxStandardRate: settings.taxStandardRate ?? 10,
    taxReducedRate: settings.taxReducedRate ?? 8,
    taxDisplayModePublic: settings.taxDisplayModePublic ?? "tax_included",
    durationDiscountEnabled: settings.durationDiscountEnabled ?? false,
    durationDiscountRules: settings.durationDiscountRules ?? null,
    discountCombinationMode: settings.discountCombinationMode ?? "best",
    showOriginalPrice: settings.showOriginalPrice ?? true,
  }),
}));

mock.module("@/shared/domain/reservations/checkout-session-expiry", () => ({
  expireOpenCheckoutSessionBestEffort: mockExpireOpenCheckoutSessionBestEffort,
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
const { applyCalendarTimeChange, cancelReservationFromCalendar } =
  await import("@/shared/domain/reservations/calendar-sync");

describe("applyCalendarTimeChange (GCal inbound pricing)", () => {
  const baseInput = {
    reservationId: "res-1",
    spaceId: "space-1",
    existingNotes: null,
    startTime: new Date("2027-03-01T10:00:00+09:00"),
    endTime: new Date("2027-03-01T12:00:00+09:00"),
  };

  beforeEach(() => {
    mockReservationFindFirstTx.mockReset();
    mockReservationFindFirstTx.mockResolvedValue({
      id: "res-1",
      taxRate: 10,
      coupon: null,
    });
    mockReservationUpdateMany.mockReset();
    mockReservationUpdateMany.mockResolvedValue({ count: 1 });
    mockSpaceFindUniqueTx.mockReset();
    mockSpaceFindUniqueTx.mockResolvedValue({
      hourlyPrice: 2000,
      discountType: "none",
      discountValue: null,
      durationDiscountOverride: "use_global",
      taxRateType: "standard",
    });
    mockCheckSpaceOverlap.mockReset();
    mockCheckSpaceOverlap.mockResolvedValue({ hasOverlap: false });
    mockGetSpaceRatePlans.mockReset();
    mockGetSpaceRatePlans.mockResolvedValue([]);
    mockGetReservationSettings.mockReset();
    mockGetReservationSettings.mockResolvedValue({
      durationDiscountEnabled: false,
      durationDiscountRules: null,
      discountCombinationMode: "best",
      taxStandardRate: 10,
      taxReducedRate: 8,
      taxDisplayModePublic: "tax_included",
      showOriginalPrice: true,
    });
  });

  test("UNPAID 予約の時間変更で料金フィールドを再計算して更新する", async () => {
    const result = await applyCalendarTimeChange(baseInput);

    expect(result).toEqual({ success: true });
    expect(mockReservationUpdateMany).toHaveBeenCalledTimes(1);
    const updateArgs = mockReservationUpdateMany.mock.calls[0]?.[0] as {
      where: Record<string, unknown>;
      data: Record<string, unknown>;
    };
    expect(updateArgs.where).toMatchObject({
      id: "res-1",
      paymentStatus: PaymentStatus.UNPAID,
      status: { in: [ReservationStatus.PENDING, ReservationStatus.CONFIRMED] },
    });
    expect(updateArgs.data["startTime"]).toEqual(baseInput.startTime);
    expect(updateArgs.data["endTime"]).toEqual(baseInput.endTime);
    expect(updateArgs.data["totalPrice"]).toBe(4000);
    expect(updateArgs.data["basePrice"]).toBe(4000);
    expect(updateArgs.data["taxAmount"]).toBe(400);
    expect(updateArgs.data["totalPriceWithTax"]).toBe(4400);
    expect(updateArgs.data["priceOverriddenBy"]).toBeNull();
  });

  test("updateMany count=0 のとき payment_race を返す", async () => {
    mockReservationUpdateMany.mockResolvedValue({ count: 0 });

    const result = await applyCalendarTimeChange(baseInput);

    expect(result).toEqual({ success: false, reason: "payment_race" });
  });

  test("tx 内 findFirst が UNPAID 以外のとき payment_race を返す", async () => {
    mockReservationFindFirstTx.mockResolvedValue(null);

    const result = await applyCalendarTimeChange(baseInput);

    expect(result).toEqual({ success: false, reason: "payment_race" });
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });

  test("重複時は overlap を返し時間のみ更新しない", async () => {
    mockCheckSpaceOverlap.mockResolvedValue({
      hasOverlap: true,
      type: "reservation",
      conflictId: "res-conflict",
      startTime: new Date("2027-03-01T11:00:00+09:00"),
      endTime: new Date("2027-03-01T13:00:00+09:00"),
    });

    const result = await applyCalendarTimeChange(baseInput);

    expect(result.success).toBe(false);
    if (result.success || result.reason !== "overlap") {
      throw new Error("expected overlap failure");
    }
    expect(result.conflictingReservation.id).toBe("res-conflict");
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
    expect(mockReservationUpdate).toHaveBeenCalledTimes(1);
  });

  test("space が見つからないとき pricing_unavailable を返す", async () => {
    mockSpaceFindUniqueTx.mockResolvedValue(null);

    const result = await applyCalendarTimeChange(baseInput);

    expect(result).toEqual({ success: false, reason: "pricing_unavailable" });
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });

  test("end <= start のとき pricing_unavailable を返す", async () => {
    mockGetSpaceRatePlans.mockClear();

    const result = await applyCalendarTimeChange({
      ...baseInput,
      endTime: baseInput.startTime,
    });

    expect(result).toEqual({ success: false, reason: "pricing_unavailable" });
    expect(mockGetSpaceRatePlans).not.toHaveBeenCalled();
  });
});

describe("cancelReservationFromCalendar (PENDING checkout expire)", () => {
  beforeEach(() => {
    mockReservationFindFirstOuter.mockReset();
    mockReservationUpdateMany.mockReset();
    mockReservationUpdateMany.mockResolvedValue({ count: 1 });
    mockReservationFindUniqueTx.mockReset();
    mockReservationFindUniqueTx.mockResolvedValue({ couponId: null });
    mockExpireOpenCheckoutSessionBestEffort.mockReset();
  });

  test("PENDING + stripeCheckoutSessionId ありの claim 成功後に Checkout を expire する", async () => {
    mockReservationFindFirstOuter.mockResolvedValue({
      paymentStatus: PaymentStatus.PENDING,
      stripeCheckoutSessionId: "cs_test_123",
    });

    const result = await cancelReservationFromCalendar({
      reservationId: "res-pending",
      existingNotes: null,
    });

    expect(result).toEqual({ cancelled: true });
    expect(mockExpireOpenCheckoutSessionBestEffort).toHaveBeenCalledWith({
      reservationId: "res-pending",
      sessionId: "cs_test_123",
    });
  });

  test("UNPAID の claim 成功時は Checkout expire を呼ばない", async () => {
    mockReservationFindFirstOuter.mockResolvedValue({
      paymentStatus: PaymentStatus.UNPAID,
      stripeCheckoutSessionId: null,
    });

    const result = await cancelReservationFromCalendar({
      reservationId: "res-unpaid",
      existingNotes: null,
    });

    expect(result).toEqual({ cancelled: true });
    expect(mockExpireOpenCheckoutSessionBestEffort).not.toHaveBeenCalled();
  });
});
