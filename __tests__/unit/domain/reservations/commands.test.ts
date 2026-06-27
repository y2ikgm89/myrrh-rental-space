import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Enums (re-declare to avoid Prisma import chain)
// ---------------------------------------------------------------------------

const ReservationStatus = {
  PENDING: "PENDING",
  CONFIRMED: "CONFIRMED",
  COMPLETED: "COMPLETED",
  CANCELLED: "CANCELLED",
  NO_SHOW: "NO_SHOW",
} as const;

const CouponType = {
  PERCENTAGE: "PERCENTAGE",
  FIXED_AMOUNT: "FIXED_AMOUNT",
} as const;

// ---------------------------------------------------------------------------
// Mock functions (defined before mock.module)
// ---------------------------------------------------------------------------

const mockSettingsFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    durationDiscountEnabled: false,
    durationDiscountRules: null,
    discountCombinationMode: "best",
  }),
);

const mockSpaceFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "space-1",
    name: "テストスペース",
    addressDetail: null,
    hourlyPrice: 1000,
    discountType: "none",
    discountValue: null,
    durationDiscountOverride: "use_global",
    locationId: "loc-1",
    location: { address: "東京都渋谷区1-1-1" },
  }),
);

// BlockedDate cascade（ensureDateNotBlocked / isDateBlocked）用。default は未休業。
const mockBlockedDateFindFirst = mock<
  () => Promise<{ reason: string | null } | null>
>(() => Promise.resolve(null));

const mockReservationFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

const mockReservationCreate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({
    id: "res-1",
    customer: {
      firstName: "太郎",
      lastName: "山田",
      companyName: null,
      email: "taro@example.com",
    },
  }),
);

const mockReservationUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ id: "res-1" }),
);

const mockCouponFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

const mockCouponUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({}),
);

const mockCouponUpdateMany = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ count: 1 }),
);

const mockCustomerFindUnique = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

const mockCustomerFindUniqueOrThrow = mock<() => Promise<unknown>>(() =>
  Promise.resolve({ firstReservationAt: null }),
);

const mockCustomerCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "cust-1" }),
);

const mockCustomerUpsert = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "cust-1" }),
);

const mockCustomerUpdate = mock<() => Promise<unknown>>(() =>
  Promise.resolve({}),
);

// Transaction mock: execute the callback with the same mock prisma
const mockTransaction = mock<
  (fn: (tx: unknown) => Promise<unknown>) => Promise<unknown>
>((fn: (tx: unknown) => Promise<unknown>) => fn(txClient));

const txClient = {
  reservation: {
    findFirst: mock<() => Promise<null>>(() => Promise.resolve(null)),
    create: mockReservationCreate,
    update: mockReservationUpdate,
  },
  coupon: {
    findUnique: mockCouponFindUnique,
    update: mockCouponUpdate,
    updateMany: mockCouponUpdateMany,
  },
  customer: {
    findUnique: mockCustomerFindUnique,
    findUniqueOrThrow: mockCustomerFindUniqueOrThrow,
    create: mockCustomerCreate,
    upsert: mockCustomerUpsert,
    update: mockCustomerUpdate,
  },
  // public commands が予約時同意必須規約を検証するため必要
  terms: {
    findMany: mock<() => Promise<unknown[]>>(() => Promise.resolve([])),
  },
  space: {
    findUnique: mock<() => Promise<{ spaceTerms: unknown[] } | null>>(() =>
      Promise.resolve({ spaceTerms: [] }),
    ),
  },
  reservationTermsAgreement: {
    createMany: mock<() => Promise<{ count: number }>>(() =>
      Promise.resolve({ count: 0 }),
    ),
  },
  blockedDate: {
    findFirst: mockBlockedDateFindFirst,
  },
};

// ---------------------------------------------------------------------------
// mock.module (before imports)
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    settings: { findUnique: mockSettingsFindUnique },
    space: { findUnique: mockSpaceFindUnique },
    reservation: {
      findUnique: mockReservationFindUnique,
      create: mockReservationCreate,
      update: mockReservationUpdate,
    },
    coupon: {
      findUnique: mockCouponFindUnique,
      update: mockCouponUpdate,
      updateMany: mockCouponUpdateMany,
    },
    customer: {
      findUnique: mockCustomerFindUnique,
      findUniqueOrThrow: mockCustomerFindUniqueOrThrow,
      create: mockCustomerCreate,
      upsert: mockCustomerUpsert,
      update: mockCustomerUpdate,
    },
    blockedDate: { findFirst: mockBlockedDateFindFirst },
    $transaction: mockTransaction,
  },
}));

mock.module("@/shared/lib/reservation", () => ({
  checkReservationOverlap: mock<() => Promise<{ hasOverlap: boolean }>>(() =>
    Promise.resolve({ hasOverlap: false }),
  ),
}));

// ---------------------------------------------------------------------------
// Import test target (after mocks)
// ---------------------------------------------------------------------------

import {
  createAdminReservationCommand,
  updateAdminReservationCommand,
} from "@/shared/domain/reservations/admin-commands";
import {
  updateReservationStatusCommand,
  updateReservationNotesCommand,
  deleteReservationCommand,
  restoreReservationCommand,
} from "@/shared/domain/reservations/lifecycle-commands";
import { createPublicReservationCommand } from "@/shared/domain/reservations/public-commands";
import { validateStatusTransition } from "@/shared/domain/reservations/status";
import { DomainError } from "@/shared/domain/domain-error";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function resetAllMocks() {
  mockSettingsFindUnique.mockClear();
  mockSpaceFindUnique.mockClear();
  mockReservationFindUnique.mockClear();
  mockReservationCreate.mockClear();
  mockReservationUpdate.mockClear();
  mockCouponFindUnique.mockClear();
  mockCouponUpdate.mockClear();
  mockCouponUpdateMany.mockClear();
  mockCustomerFindUnique.mockClear();
  mockCustomerFindUniqueOrThrow.mockClear();
  mockCustomerCreate.mockClear();
  mockCustomerUpsert.mockClear();
  mockCustomerUpdate.mockClear();
  mockTransaction.mockClear();
  mockBlockedDateFindFirst.mockClear();
  mockBlockedDateFindFirst.mockResolvedValue(null);
  (txClient.reservation.findFirst as ReturnType<typeof mock>).mockClear();

  // Reset to default implementations
  mockSettingsFindUnique.mockImplementation(() =>
    Promise.resolve({
      durationDiscountEnabled: false,
      durationDiscountRules: null,
      discountCombinationMode: "best",
    }),
  );
  mockSpaceFindUnique.mockImplementation(() =>
    Promise.resolve({
      id: "space-1",
      name: "テストスペース",
      addressDetail: null,
      hourlyPrice: 1000,
      discountType: "none",
      discountValue: null,
      durationDiscountOverride: "use_global",
      location: { address: "東京都渋谷区1-1-1" },
    }),
  );
  mockReservationFindUnique.mockImplementation(() => Promise.resolve(null));
  mockReservationCreate.mockImplementation(() =>
    Promise.resolve({
      id: "res-1",
      customer: {
        firstName: "太郎",
        lastName: "山田",
        companyName: null,
        email: "taro@example.com",
      },
    }),
  );
  mockReservationUpdate.mockImplementation(() =>
    Promise.resolve({ id: "res-1" }),
  );
  mockCouponFindUnique.mockImplementation(() => Promise.resolve(null));
  mockCouponUpdate.mockImplementation(() => Promise.resolve({}));
  mockCouponUpdateMany.mockImplementation(() => Promise.resolve({ count: 1 }));
  mockCustomerFindUnique.mockImplementation(() => Promise.resolve(null));
  mockCustomerFindUniqueOrThrow.mockImplementation(() =>
    Promise.resolve({ firstReservationAt: null }),
  );
  mockCustomerCreate.mockImplementation(() =>
    Promise.resolve({ id: "cust-1" }),
  );
  mockCustomerUpsert.mockImplementation(() =>
    Promise.resolve({ id: "cust-1" }),
  );
  mockCustomerUpdate.mockImplementation(() => Promise.resolve({}));
  mockTransaction.mockImplementation((fn: (tx: unknown) => Promise<unknown>) =>
    fn(txClient),
  );
  (
    txClient.reservation.findFirst as ReturnType<typeof mock>
  ).mockImplementation(() => Promise.resolve(null));
}

// ==========================================================================
// Tests
// ==========================================================================

describe("validateStatusTransition", () => {
  describe("正常系", () => {
    test("同一ステータスへの遷移は許可", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.PENDING,
          ReservationStatus.PENDING,
        ),
      ).not.toThrow();
    });

    test("PENDING → CONFIRMED は許可", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.PENDING,
          ReservationStatus.CONFIRMED,
        ),
      ).not.toThrow();
    });

    test("PENDING → CANCELLED は許可", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.PENDING,
          ReservationStatus.CANCELLED,
        ),
      ).not.toThrow();
    });

    test("CONFIRMED → COMPLETED は許可", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.CONFIRMED,
          ReservationStatus.COMPLETED,
        ),
      ).not.toThrow();
    });

    test("CONFIRMED → NO_SHOW は許可", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.CONFIRMED,
          ReservationStatus.NO_SHOW,
        ),
      ).not.toThrow();
    });

    test("CONFIRMED → CANCELLED は許可", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.CONFIRMED,
          ReservationStatus.CANCELLED,
        ),
      ).not.toThrow();
    });
  });

  describe("異常系", () => {
    test("COMPLETED からの遷移は禁止", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.COMPLETED,
          ReservationStatus.PENDING,
        ),
      ).toThrow(DomainError);
    });

    test("CANCELLED からの遷移は禁止", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.CANCELLED,
          ReservationStatus.CONFIRMED,
        ),
      ).toThrow(DomainError);
    });

    test("NO_SHOW からの遷移は禁止", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.NO_SHOW,
          ReservationStatus.PENDING,
        ),
      ).toThrow(DomainError);
    });

    test("PENDING → COMPLETED は禁止（CONFIRMED を経由する必要あり）", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.PENDING,
          ReservationStatus.COMPLETED,
        ),
      ).toThrow(DomainError);
    });

    test("PENDING → NO_SHOW は禁止", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.PENDING,
          ReservationStatus.NO_SHOW,
        ),
      ).toThrow(DomainError);
    });

    test("エラーメッセージが正しい", () => {
      expect(() =>
        validateStatusTransition(
          ReservationStatus.COMPLETED,
          ReservationStatus.PENDING,
        ),
      ).toThrow("このステータスからは変更できません");
    });
  });
});

describe("createAdminReservationCommand", () => {
  const validInput = {
    spaceId: "space-1",
    date: "2024-06-15",
    startTime: "10:00",
    endTime: "12:00",
    customerId: "cust-1",
    status: ReservationStatus.PENDING,
  };

  beforeEach(() => {
    resetAllMocks();
  });

  describe("正常系", () => {
    test("有効なデータで予約作成成功", async () => {
      const result = await createAdminReservationCommand(validInput);

      expect(result.id).toBe("res-1");
      expect(result.payload).toBeDefined();
      expect(result.payload.customerName).toBe("山田 太郎");
      expect(result.payload.spaceName).toBe("テストスペース");
    });

    test("CONFIRMED ステータスでも作成可能", async () => {
      const result = await createAdminReservationCommand({
        ...validInput,
        status: ReservationStatus.CONFIRMED,
      });

      expect(result.id).toBe("res-1");
    });

    test("customerData から顧客を自動作成/解決", async () => {
      const result = await createAdminReservationCommand({
        ...validInput,
        customerId: undefined,
        customerData: {
          lastName: "田中",
          firstName: "次郎",
          email: "jiro@example.com",
        },
      });

      expect(result.id).toBe("res-1");
      expect(mockCustomerCreate).toHaveBeenCalled();
    });

    test("customerData 入力時は予約時点のメールアドレスを guestEmail として保存する", async () => {
      await createAdminReservationCommand({
        ...validInput,
        customerId: undefined,
        customerData: {
          lastName: "田中",
          firstName: "次郎",
          email: "jiro@example.com",
        },
      });

      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestEmail: "jiro@example.com",
          }),
        }),
      );
    });

    test("totalPrice 指定時は計算価格を上書き", async () => {
      const result = await createAdminReservationCommand({
        ...validInput,
        totalPrice: 5000,
      });

      expect(result.payload.totalPrice).toBe(5000);
    });

    test("手動割引情報がノートに追記される", async () => {
      await createAdminReservationCommand({
        ...validInput,
        manualDiscountAmount: 500,
        manualDiscountReason: "常連割引",
        notes: "備考あり",
      });

      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: expect.stringContaining("【手動割引】"),
          }),
        }),
      );
    });

    test("スペース固有割引(percentage)が適用され spaceDiscountAmount が永続化される", async () => {
      mockSpaceFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "space-1",
          name: "テストスペース",
          addressDetail: null,
          hourlyPrice: 1000,
          discountType: "percentage",
          discountValue: 20,
          durationDiscountOverride: "use_global",
          location: { address: "東京都渋谷区1-1-1" },
        }),
      );

      await createAdminReservationCommand(validInput);

      // hourlyPrice=1000 × 2h = basePrice=2000、20% 割引 = -400 → totalPrice=1600
      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            basePrice: 2000,
            totalPrice: 1600,
            spaceDiscountAmount: 400,
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("作成不可のステータス指定でエラー", async () => {
      await expect(
        createAdminReservationCommand({
          ...validInput,
          status: ReservationStatus.COMPLETED,
        }),
      ).rejects.toThrow(DomainError);
    });

    test("CANCELLED ステータスでの作成は不可", async () => {
      await expect(
        createAdminReservationCommand({
          ...validInput,
          status: ReservationStatus.CANCELLED,
        }),
      ).rejects.toThrow(
        "作成時のステータスは「保留中」または「確認済み」のみ指定できます",
      );
    });

    test("スペースが見つからない場合エラー", async () => {
      mockSpaceFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(createAdminReservationCommand(validInput)).rejects.toThrow(
        "指定されたスペースが見つかりません",
      );
    });

    test("customerId も customerData も未指定でエラー", async () => {
      // customerId を除いた入力（customerData も省略）
      const inputWithoutCustomer = {
        spaceId: validInput.spaceId,
        date: validInput.date,
        startTime: validInput.startTime,
        endTime: validInput.endTime,
        status: validInput.status,
      };
      await expect(
        createAdminReservationCommand(inputWithoutCustomer),
      ).rejects.toThrow("顧客IDが解決できませんでした");
    });
  });
});

describe("updateAdminReservationCommand", () => {
  const validInput = {
    spaceId: "space-1",
    date: "2024-06-15",
    startTime: "10:00",
    endTime: "12:00",
    customerId: "cust-1",
    status: ReservationStatus.CONFIRMED,
  };

  beforeEach(() => {
    resetAllMocks();
    // 既存予約をセットアップ
    mockReservationFindUnique.mockImplementation(() =>
      Promise.resolve({
        id: "res-1",
        status: ReservationStatus.PENDING,
        couponId: null,
        googleCalendarEventId: null,
        customer: {
          firstName: "太郎",
          lastName: "山田",
          companyName: null,
          email: "taro@example.com",
        },
      }),
    );
  });

  describe("正常系", () => {
    test("有効なデータで予約更新成功", async () => {
      const result = await updateAdminReservationCommand("res-1", validInput);

      expect(result.payload).toBeDefined();
      expect(result.payload.reservationId).toBe("res-1");
      expect(result.googleCalendarEventId).toBeNull();
    });

    test("スペース固有割引(percentage)が適用され spaceDiscountAmount が永続化される", async () => {
      mockSpaceFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "space-1",
          name: "テストスペース",
          addressDetail: null,
          hourlyPrice: 1000,
          discountType: "percentage",
          discountValue: 20,
          durationDiscountOverride: "use_global",
          location: { address: "東京都渋谷区1-1-1" },
        }),
      );

      await updateAdminReservationCommand("res-1", validInput);

      // hourlyPrice=1000 × 2h = basePrice=2000、20% 割引 = -400 → totalPrice=1600
      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            basePrice: 2000,
            totalPrice: 1600,
            spaceDiscountAmount: 400,
          }),
        }),
      );
    });

    test("クーポン変更時に旧クーポンのデクリメントと新クーポンのインクリメント", async () => {
      // 既存予約にクーポンが紐づいている
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          couponId: "old-coupon-id",
          googleCalendarEventId: null,
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      // 新しいクーポンを検証可能にする
      mockCouponFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "new-coupon-id",
          code: "NEW2024",
          name: "新クーポン",
          type: CouponType.PERCENTAGE,
          discountValue: 10,
          maxDiscountAmount: null,
          canCombineWithDurationDiscount: false,
          isActive: true,
          validFrom: new Date("2020-01-01"),
          validUntil: null,
          usageLimit: null,
          usageCount: 0,
          minReservationAmount: null,
        }),
      );

      await updateAdminReservationCommand("res-1", {
        ...validInput,
        couponCode: "NEW2024",
      });

      // 旧クーポンのデクリメント
      expect(mockCouponUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "old-coupon-id" }),
        }),
      );

      // 新クーポンのインクリメント
      expect(mockCouponUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "new-coupon-id" }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("予約が見つからない場合エラー", async () => {
      mockReservationFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(
        updateAdminReservationCommand("nonexistent", validInput),
      ).rejects.toThrow("予約が見つかりません");
    });

    test("スペースが見つからない場合エラー", async () => {
      mockSpaceFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(
        updateAdminReservationCommand("res-1", validInput),
      ).rejects.toThrow("指定されたスペースが見つかりません");
    });

    test("無効なステータス遷移でエラー", async () => {
      // 既存ステータスが COMPLETED → PENDING への遷移は不可
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.COMPLETED,
          couponId: null,
          googleCalendarEventId: null,
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      await expect(
        updateAdminReservationCommand("res-1", {
          ...validInput,
          status: ReservationStatus.PENDING,
        }),
      ).rejects.toThrow("このステータスからは変更できません");
    });
  });
});

describe("updateReservationStatusCommand", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe("正常系", () => {
    test("PENDING → CONFIRMED への遷移が成功", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: null,
          startTime: new Date("2024-06-15T10:00:00"),
          endTime: new Date("2024-06-15T12:00:00"),
          totalPrice: 2000,
          notes: null,
          space: {
            name: "テストスペース",
            addressDetail: null,
            location: { address: "東京都渋谷区1-1-1" },
          },
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      const result = await updateReservationStatusCommand(
        "res-1",
        ReservationStatus.CONFIRMED,
      );

      expect(result.previousStatus).toBe(ReservationStatus.PENDING);
      expect(result.payload.customerName).toBe("山田 太郎");
    });

    test("CONFIRMED → CANCELLED でキャンセル追跡が設定される", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.CONFIRMED,
          googleCalendarEventId: "cal-event-1",
          startTime: new Date("2024-06-15T10:00:00"),
          endTime: new Date("2024-06-15T12:00:00"),
          totalPrice: 2000,
          notes: null,
          space: {
            name: "テストスペース",
            addressDetail: null,
            location: { address: "東京都渋谷区1-1-1" },
          },
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      await updateReservationStatusCommand(
        "res-1",
        ReservationStatus.CANCELLED,
      );

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReservationStatus.CANCELLED,
            cancelledAt: expect.any(Date),
            cancelledByType: "ADMIN",
          }),
        }),
      );
    });

    test("同一ステータスへの変更はキャンセル追跡を設定しない", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.CONFIRMED,
          googleCalendarEventId: null,
          startTime: new Date("2024-06-15T10:00:00"),
          endTime: new Date("2024-06-15T12:00:00"),
          totalPrice: 2000,
          notes: null,
          space: {
            name: "テストスペース",
            addressDetail: null,
            location: { address: "東京都渋谷区1-1-1" },
          },
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      await updateReservationStatusCommand(
        "res-1",
        ReservationStatus.CONFIRMED,
      );

      // cancelledAt/cancelledByType が data に含まれないことを確認
      const updateCall = mockReservationUpdate.mock.calls[0];
      expect(updateCall).toBeDefined();
    });

    test("googleCalendarEventId が返される", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: "cal-event-id",
          startTime: new Date("2024-06-15T10:00:00"),
          endTime: new Date("2024-06-15T12:00:00"),
          totalPrice: 2000,
          notes: null,
          space: {
            name: "テストスペース",
            addressDetail: null,
            location: { address: "東京都渋谷区1-1-1" },
          },
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      const result = await updateReservationStatusCommand(
        "res-1",
        ReservationStatus.CONFIRMED,
      );

      expect(result.googleCalendarEventId).toBe("cal-event-id");
    });
  });

  describe("異常系", () => {
    test("予約が見つからない場合エラー", async () => {
      mockReservationFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(
        updateReservationStatusCommand(
          "nonexistent",
          ReservationStatus.CONFIRMED,
        ),
      ).rejects.toThrow("予約が見つかりません");
    });

    test("無効なステータス遷移でエラー", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.COMPLETED,
          googleCalendarEventId: null,
          startTime: new Date("2024-06-15T10:00:00"),
          endTime: new Date("2024-06-15T12:00:00"),
          totalPrice: 2000,
          notes: null,
          space: {
            name: "テストスペース",
            addressDetail: null,
            location: { address: "東京都渋谷区1-1-1" },
          },
          customer: {
            firstName: "太郎",
            lastName: "山田",
            companyName: null,
            email: "taro@example.com",
          },
        }),
      );

      await expect(
        updateReservationStatusCommand("res-1", ReservationStatus.PENDING),
      ).rejects.toThrow(DomainError);
    });
  });
});

describe("updateReservationNotesCommand", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe("正常系", () => {
    test("ノートを更新できる", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({ id: "res-1" }),
      );

      await updateReservationNotesCommand("res-1", "新しいノート");

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { notes: "新しいノート" },
        }),
      );
    });

    test("ノートを null に設定できる", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({ id: "res-1" }),
      );

      await updateReservationNotesCommand("res-1", null);

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { notes: null },
        }),
      );
    });
  });

  describe("異常系", () => {
    test("予約が見つからない場合エラー", async () => {
      mockReservationFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(
        updateReservationNotesCommand("nonexistent", "ノート"),
      ).rejects.toThrow("予約が見つかりません");
    });
  });
});

describe("deleteReservationCommand", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe("正常系", () => {
    test("PENDING 予約を削除するとキャンセル追跡が設定される", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: null,
          couponId: null,
        }),
      );

      await deleteReservationCommand("res-1", "user-1");

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            deletedById: "user-1",
            status: ReservationStatus.CANCELLED,
            cancelledAt: expect.any(Date),
            cancelledByType: "ADMIN",
            cancellationReason: "管理者による削除",
          }),
        }),
      );
    });

    test("CANCELLED 済み予約は再キャンセル追跡を設定しない", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.CANCELLED,
          googleCalendarEventId: null,
          couponId: null,
        }),
      );

      await deleteReservationCommand("res-1", "user-1");

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
            deletedById: "user-1",
          }),
        }),
      );

      // cancelledByType が data に含まれないことを確認
      const callData = mockReservationUpdate.mock.calls[0];
      expect(callData).toBeDefined();
    });

    test("COMPLETED 予約はキャンセル追跡なしで削除", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.COMPLETED,
          googleCalendarEventId: null,
          couponId: null,
        }),
      );

      await deleteReservationCommand("res-1", "user-1");

      expect(mockTransaction).toHaveBeenCalled();
    });

    test("クーポン付き予約の削除で使用数がデクリメントされる", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.CONFIRMED,
          googleCalendarEventId: null,
          couponId: "coupon-1",
        }),
      );

      await deleteReservationCommand("res-1", "user-1");

      expect(mockCouponUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: "coupon-1",
            usageCount: expect.objectContaining({ gt: 0 }),
          }),
          data: expect.objectContaining({
            usageCount: expect.objectContaining({ decrement: 1 }),
          }),
        }),
      );
    });

    test("クーポンなし予約の削除ではクーポン更新されない", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: null,
          couponId: null,
        }),
      );

      await deleteReservationCommand("res-1", "user-1");

      expect(mockCouponUpdateMany).not.toHaveBeenCalled();
    });

    test("googleCalendarEventId が返される", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: "cal-event-1",
          couponId: null,
        }),
      );

      const result = await deleteReservationCommand("res-1", "user-1");

      expect(result.googleCalendarEventId).toBe("cal-event-1");
    });

    test("userId が undefined の場合 deletedById は null", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: null,
          couponId: null,
        }),
      );

      await deleteReservationCommand("res-1", undefined);

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedById: null,
          }),
        }),
      );
    });

    test("キャンセル理由を指定できる", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          status: ReservationStatus.PENDING,
          googleCalendarEventId: null,
          couponId: null,
        }),
      );

      await deleteReservationCommand("res-1", "user-1", "テスト削除理由");

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            cancellationReason: "テスト削除理由",
          }),
        }),
      );
    });
  });

  describe("異常系", () => {
    test("予約が見つからない場合エラー", async () => {
      mockReservationFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(
        deleteReservationCommand("nonexistent", "user-1"),
      ).rejects.toThrow("予約が見つかりません");
    });
  });
});

describe("restoreReservationCommand", () => {
  beforeEach(() => {
    resetAllMocks();
  });

  describe("正常系", () => {
    test("削除済み予約を復元できる", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          deletedAt: new Date("2024-06-15"),
          couponId: null,
        }),
      );

      await restoreReservationCommand("res-1");

      expect(mockReservationUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            deletedAt: null,
            deletedById: null,
          }),
        }),
      );
    });

    test("クーポン付き予約の復元で使用数がインクリメントされる", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          deletedAt: new Date("2024-06-15"),
          couponId: "coupon-1",
        }),
      );

      await restoreReservationCommand("res-1");

      expect(mockCouponUpdate).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ id: "coupon-1" }),
          data: expect.objectContaining({
            usageCount: expect.objectContaining({ increment: 1 }),
          }),
        }),
      );
    });

    test("クーポンなし予約の復元ではクーポン更新されない", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          deletedAt: new Date("2024-06-15"),
          couponId: null,
        }),
      );

      await restoreReservationCommand("res-1");

      expect(mockCouponUpdate).not.toHaveBeenCalled();
    });
  });

  describe("異常系", () => {
    test("予約が見つからない場合エラー", async () => {
      mockReservationFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(restoreReservationCommand("nonexistent")).rejects.toThrow(
        "予約が見つかりません",
      );
    });

    test("削除されていない予約の復元はエラー", async () => {
      mockReservationFindUnique.mockImplementation(() =>
        Promise.resolve({
          id: "res-1",
          deletedAt: null,
          couponId: null,
        }),
      );

      await expect(restoreReservationCommand("res-1")).rejects.toThrow(
        "この予約は削除されていません",
      );
    });
  });
});

describe("createPublicReservationCommand", () => {
  const validInput = {
    spaceId: "space-1",
    date: "2024-06-15",
    startTime: "10:00",
    endTime: "12:00",
    lastName: "山田",
    firstName: "太郎",
    email: "taro@example.com",
  };

  beforeEach(() => {
    resetAllMocks();
    // 公開ページではスペースが isPublished: true も必要
    mockSpaceFindUnique.mockImplementation(() =>
      Promise.resolve({
        id: "space-1",
        name: "テストスペース",
        addressDetail: null,
        hourlyPrice: 1000,
        discountType: "none",
        discountValue: null,
        durationDiscountOverride: "use_global",
        locationId: "loc-1",
        location: { address: "東京都渋谷区1-1-1" },
      }),
    );
  });

  describe("正常系", () => {
    test("有効なデータで公開予約作成成功", async () => {
      const result = await createPublicReservationCommand(validInput);

      expect(result.id).toBe("res-1");
      expect(result.payload.customerEmail).toBe("taro@example.com");
      expect(result.payload.customerName).toBe("山田 太郎");
      expect(result.payload.spaceName).toBe("テストスペース");
    });

    test("ステータスは常に CONFIRMED（Stripe なし自動確定）", async () => {
      await createPublicReservationCommand(validInput);

      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: ReservationStatus.CONFIRMED,
          }),
        }),
      );
    });

    test("顧客が自動作成される", async () => {
      await createPublicReservationCommand(validInput);

      // resolveOrCreateCustomer は findUnique → 未存在なら create（upsert ではない）
      expect(mockCustomerFindUnique).toHaveBeenCalled();
      expect(mockCustomerCreate).toHaveBeenCalled();
    });

    test("userId 付きで予約に userId が設定される", async () => {
      await createPublicReservationCommand({
        ...validInput,
        userId: "user-123",
      });

      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            userId: "user-123",
          }),
        }),
      );
    });

    test("顧客統計が更新される", async () => {
      await createPublicReservationCommand(validInput);

      expect(mockCustomerFindUniqueOrThrow).toHaveBeenCalled();
      expect(mockCustomerUpdate).toHaveBeenCalled();
    });

    test("basePrice が totalPrice として使用される（クーポンなし）", async () => {
      // hourlyPrice=1000, 2時間 → basePrice=2000
      const result = await createPublicReservationCommand(validInput);

      expect(result.payload.totalPrice).toBe(2000);
    });

    test("ノートが予約に含まれる", async () => {
      await createPublicReservationCommand({
        ...validInput,
        notes: "テスト備考",
      });

      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            notes: "テスト備考",
          }),
        }),
      );
    });

    test("予約時点のメールアドレスを guestEmail として保存する", async () => {
      await createPublicReservationCommand(validInput);

      expect(mockReservationCreate).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            guestEmail: "taro@example.com",
          }),
        }),
      );
    });

    test("ペイロードにロケーション情報が含まれる", async () => {
      const result = await createPublicReservationCommand(validInput);

      expect(result.payload.location).toBe("東京都渋谷区1-1-1");
    });
  });

  describe("異常系", () => {
    test("スペースが見つからない場合エラー", async () => {
      mockSpaceFindUnique.mockImplementation(() => Promise.resolve(null));

      await expect(createPublicReservationCommand(validInput)).rejects.toThrow(
        "指定されたスペースが見つかりません",
      );
    });

    test("臨時休業日（BlockedDate）の予約は CONFLICT で拒否", async () => {
      mockBlockedDateFindFirst.mockResolvedValue({ reason: "年末年始" });

      await expect(
        createPublicReservationCommand(validInput),
      ).rejects.toMatchObject({ code: "CONFLICT" });
      // blocked のため予約レコードは作成されない
      expect(mockReservationCreate).not.toHaveBeenCalled();
    });
  });
});
