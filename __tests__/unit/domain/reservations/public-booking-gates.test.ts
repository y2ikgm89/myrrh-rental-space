import { describe, test, expect, mock, beforeEach } from "bun:test";

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

const mockGetBusinessHoursSettingsQuery = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

const mockGetReservationRuleSettings = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    defaultTimeSlot: 60,
    minReservationDuration: 60,
    maxReservationDuration: 480,
  }),
);

const mockEnsureDateNotBlocked = mock<() => Promise<void>>(() =>
  Promise.resolve(),
);

const mockGetSpaceRatePlans = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

const mockSpaceFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "space-1",
    name: "テストスペース",
    addressDetail: null,
    capacity: 10,
    hourlyPrice: 1000,
    discountType: "NONE",
    discountValue: null,
    durationDiscountOverride: "use_global",
    taxRateType: "STANDARD",
    locationId: "loc-1",
    location: { address: "東京都渋谷区1-1-1" },
  }),
);

const mockReservationCreate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "res-1",
    customerId: "cust-1",
    icsSequence: 0,
    customer: {
      firstName: "太郎",
      lastName: "山田",
      companyName: null,
      email: "taro@example.com",
    },
  }),
);

const mockCustomerFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockCustomerCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "cust-1" }),
);
const mockCustomerFindUniqueOrThrow = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ firstReservationAt: null }),
);
const mockCustomerUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({}),
);
const mockSettingsCommerceFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "BEST",
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "TAX_INCLUDED",
    showOriginalPrice: true,
  }),
);
const mockCouponFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);
const mockExecuteRaw = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockCheckSpaceOverlap = mock<() => Promise<{ hasOverlap: boolean }>>(() =>
  Promise.resolve({ hasOverlap: false }),
);

const mockSpaceFindUniqueOuter = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ locationId: "loc-1", capacity: 10 }),
);
const mockSpaceFindUniqueTx = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "space-1",
    locationId: "loc-1",
    capacity: 10,
    hourlyPrice: 1000,
    discountType: "NONE",
    discountValue: null,
    durationDiscountOverride: "use_global",
    taxRateType: "STANDARD",
  }),
);
const mockTxReservationFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "res-1",
    status: ReservationStatus.CONFIRMED,
    paymentStatus: "UNPAID",
    startTime: new Date("2026-12-01T02:00:00Z"),
    taxRateType: "STANDARD",
    taxRate: 10,
    couponId: null,
    couponDiscountAmount: null,
    durationDiscountAmount: null,
    spaceDiscountAmount: null,
    googleCalendarEventId: null,
    coupon: null,
  }),
);
const mockReservationUpdateMany = mock<
  (args: Record<string, unknown>) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 1 }));
const mockSettingsCommerceFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "BEST",
    taxStandardRate: 10,
    taxReducedRate: 8,
    taxDisplayModePublic: "TAX_INCLUDED",
    showOriginalPrice: true,
  }),
);

const txClientPublic = {
  reservation: { create: mockReservationCreate },
  customer: {
    findFirst: mockCustomerFindFirst,
    create: mockCustomerCreate,
    findUniqueOrThrow: mockCustomerFindUniqueOrThrow,
    update: mockCustomerUpdate,
  },
  coupon: { findUnique: mockCouponFindUnique },
  terms: {
    findMany: mock<() => Promise<unknown[]>>(() => Promise.resolve([])),
  },
  $executeRaw: mockExecuteRaw,
};

const txClientCustomer = {
  reservation: {
    findFirst: mockTxReservationFindFirst,
    updateMany: mockReservationUpdateMany,
  },
  space: { findUnique: mockSpaceFindUniqueTx },
  settingsCommerce: { findFirst: mockSettingsCommerceFindFirst },
  $executeRaw: mockExecuteRaw,
};

const mockTransactionPublic = mock<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClientPublic));

const mockTransactionCustomer = mock<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>((fn) => fn(txClientCustomer));

mock.module("server-only", () => ({}));

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

mock.module("@/shared/domain/spaces/rate-plan-queries", () => ({
  getSpaceRatePlans: mockGetSpaceRatePlans,
}));

mock.module("@/shared/domain/spaces/overlap", () => ({
  checkSpaceOverlap: mockCheckSpaceOverlap,
}));

mock.module("@/shared/domain/reservations/availability", () => ({
  ensureDateNotBlocked: mockEnsureDateNotBlocked,
  getBusinessHoursSettingsQuery: mockGetBusinessHoursSettingsQuery,
  getReservationRuleSettings: mockGetReservationRuleSettings,
}));

mock.module("@/shared/domain/customers/guard", () => ({
  ensureCustomerNotBlacklisted: mock(() => Promise.resolve()),
}));

mock.module("@/shared/domain/reservations/server-deadline-instant", () => ({
  reservationDeadlineNow: () => new Date("2026-01-01T00:00:00Z"),
}));

// public / customer で prisma.$transaction の実装を切り替えるため、
// 各 describe の beforeEach で mockImplementation を差し替える。
const mockPrismaTransaction = mock<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>((fn) => mockTransactionPublic(fn));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findUnique: mock((args: unknown) => {
        // public create は SPACE_SELECT、customer update の外は locationId のみ
        void args;
        return mockSpaceFindUnique().then((space) => {
          if (space) return space;
          return mockSpaceFindUniqueOuter();
        });
      }),
    },
    settingsCommerce: { findUnique: mockSettingsCommerceFindUnique },
    coupon: { findUnique: mockCouponFindUnique },
    $transaction: mockPrismaTransaction,
  },
}));

import { createPublicReservationCommand } from "@/shared/domain/reservations/public-commands";
import { updateCustomerReservation } from "@/shared/domain/reservations/customer-commands";

const futurePublicInput = {
  spaceId: "space-1",
  date: "2026-12-15",
  startTime: "10:00",
  endTime: "12:00",
  lastName: "山田",
  firstName: "太郎",
  email: "taro@example.com",
};

const futureUpdateInput = {
  spaceId: "space-1",
  date: "2026-12-15",
  startTime: "10:00",
  endTime: "12:00",
  numberOfGuests: 1,
  version: 0,
};

describe("public booking gates — createPublicReservationCommand", () => {
  beforeEach(() => {
    mockIsFeatureEnabled.mockClear();
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockGetBusinessHoursSettingsQuery.mockClear();
    mockGetBusinessHoursSettingsQuery.mockResolvedValue(null);
    mockGetReservationRuleSettings.mockClear();
    mockEnsureDateNotBlocked.mockClear();
    mockGetSpaceRatePlans.mockClear();
    mockGetSpaceRatePlans.mockResolvedValue([]);
    mockSpaceFindUnique.mockClear();
    mockSpaceFindUnique.mockResolvedValue({
      id: "space-1",
      name: "テストスペース",
      addressDetail: null,
      capacity: 10,
      hourlyPrice: 1000,
      discountType: "NONE",
      discountValue: null,
      durationDiscountOverride: "use_global",
      taxRateType: "STANDARD",
      locationId: "loc-1",
      location: { address: "東京都渋谷区1-1-1" },
    });
    mockReservationCreate.mockClear();
    mockCustomerFindFirst.mockClear();
    mockCustomerCreate.mockClear();
    mockCheckSpaceOverlap.mockClear();
    mockPrismaTransaction.mockImplementation((fn) => mockTransactionPublic(fn));
  });

  test("営業時間外の時間帯は VALIDATION で拒否する", async () => {
    // DEFAULT は日曜休業。2026-12-20 は日曜。
    await expect(
      createPublicReservationCommand({
        ...futurePublicInput,
        date: "2026-12-20",
        startTime: "10:00",
        endTime: "12:00",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "選択した時間帯は営業時間外です",
    });
    expect(mockReservationCreate).not.toHaveBeenCalled();
  });

  test("過去の日時への予約は VALIDATION で拒否する", async () => {
    await expect(
      createPublicReservationCommand({
        ...futurePublicInput,
        date: "2020-01-01",
        startTime: "10:00",
        endTime: "12:00",
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "過去の日時には予約できません",
    });
    expect(mockSpaceFindUnique).not.toHaveBeenCalled();
    expect(mockReservationCreate).not.toHaveBeenCalled();
  });

  test("利用人数が定員を超える場合は VALIDATION で拒否する", async () => {
    await expect(
      createPublicReservationCommand({
        ...futurePublicInput,
        numberOfGuests: 11,
      }),
    ).rejects.toMatchObject({
      code: "VALIDATION",
      message: "利用人数がスペースの定員（10名）を超えています",
    });
    expect(mockReservationCreate).not.toHaveBeenCalled();
  });

  test("定員内の利用人数なら予約作成に進む", async () => {
    const result = await createPublicReservationCommand({
      ...futurePublicInput,
      numberOfGuests: 10,
    });
    expect(result.id).toBe("res-1");
    expect(mockReservationCreate).toHaveBeenCalled();
  });
});

describe("public booking gates — updateCustomerReservation", () => {
  beforeEach(() => {
    mockGetBusinessHoursSettingsQuery.mockClear();
    mockGetBusinessHoursSettingsQuery.mockResolvedValue(null);
    mockGetReservationRuleSettings.mockClear();
    mockEnsureDateNotBlocked.mockClear();
    mockGetSpaceRatePlans.mockClear();
    mockGetSpaceRatePlans.mockResolvedValue([]);
    mockCheckSpaceOverlap.mockClear();
    mockSpaceFindUniqueOuter.mockClear();
    mockSpaceFindUniqueOuter.mockResolvedValue({
      locationId: "loc-1",
      capacity: 10,
    });
    mockSpaceFindUniqueTx.mockClear();
    mockSpaceFindUniqueTx.mockResolvedValue({
      id: "space-1",
      locationId: "loc-1",
      capacity: 10,
      hourlyPrice: 1000,
      discountType: "NONE",
      discountValue: null,
      durationDiscountOverride: "use_global",
      taxRateType: "STANDARD",
    });
    mockTxReservationFindFirst.mockClear();
    mockTxReservationFindFirst.mockResolvedValue({
      id: "res-1",
      status: ReservationStatus.CONFIRMED,
      paymentStatus: "UNPAID",
      startTime: new Date("2026-12-01T02:00:00Z"),
      taxRateType: "STANDARD",
      taxRate: 10,
      couponId: null,
      couponDiscountAmount: null,
      durationDiscountAmount: null,
      spaceDiscountAmount: null,
      googleCalendarEventId: null,
      coupon: null,
    });
    mockReservationUpdateMany.mockClear();
    mockReservationUpdateMany.mockResolvedValue({ count: 1 });
    mockPrismaTransaction.mockImplementation((fn) =>
      mockTransactionCustomer(fn),
    );
    // customer update の外 space lookup は locationId のみ
    mockSpaceFindUnique.mockImplementation(() => mockSpaceFindUniqueOuter());
  });

  test("営業時間外への変更は早期 return する", async () => {
    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      {
        ...futureUpdateInput,
        date: "2026-12-20", // 日曜
        startTime: "10:00",
        endTime: "12:00",
      },
      24,
    );

    expect(result).toEqual({
      success: false,
      error: "選択した時間帯は営業時間外です",
    });
    expect(mockTxReservationFindFirst).not.toHaveBeenCalled();
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });

  test("クーポン割引適用済み予約は変更不可", async () => {
    mockTxReservationFindFirst.mockResolvedValue({
      id: "res-1",
      status: ReservationStatus.CONFIRMED,
      paymentStatus: "UNPAID",
      startTime: new Date("2026-12-01T02:00:00Z"),
      taxRateType: "STANDARD",
      taxRate: 10,
      couponId: "coupon-1",
      couponDiscountAmount: 500,
      durationDiscountAmount: null,
      spaceDiscountAmount: null,
      googleCalendarEventId: null,
      coupon: null,
    });

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      futureUpdateInput,
      24,
    );

    expect(result).toEqual({
      success: false,
      error: "割引が適用された予約は変更できません。お問い合わせください。",
    });
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });

  test("長時間割引適用済み予約は変更不可", async () => {
    mockTxReservationFindFirst.mockResolvedValue({
      id: "res-1",
      status: ReservationStatus.CONFIRMED,
      paymentStatus: "UNPAID",
      startTime: new Date("2026-12-01T02:00:00Z"),
      taxRateType: "STANDARD",
      taxRate: 10,
      couponId: null,
      couponDiscountAmount: null,
      durationDiscountAmount: 300,
      spaceDiscountAmount: null,
      googleCalendarEventId: null,
      coupon: null,
    });

    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      futureUpdateInput,
      24,
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe(
        "割引が適用された予約は変更できません。お問い合わせください。",
      );
    }
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });

  test("利用人数が定員を超える変更は早期 return する", async () => {
    const result = await updateCustomerReservation(
      "res-1",
      "cust-1",
      {
        ...futureUpdateInput,
        numberOfGuests: 11,
      },
      24,
    );

    expect(result).toEqual({
      success: false,
      error: "利用人数がスペースの定員（10名）を超えています",
    });
    expect(mockTxReservationFindFirst).not.toHaveBeenCalled();
    expect(mockReservationUpdateMany).not.toHaveBeenCalled();
  });
});
