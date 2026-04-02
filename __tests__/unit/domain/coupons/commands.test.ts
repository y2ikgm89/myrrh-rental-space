import { describe, test, expect, mock, beforeEach } from "bun:test";

// CouponType 定数（@generated/prisma/enums から Prisma enum を再現）
const CouponType = {
  PERCENTAGE: "PERCENTAGE",
  FIXED_AMOUNT: "FIXED_AMOUNT",
} as const;
type CouponType = (typeof CouponType)[keyof typeof CouponType];

// Prisma モック関数（mock.module より先に定義）
const mockCouponFindUnique = mock<
  () => Promise<{ id: string; code: string; isActive: boolean } | null>
>(() => Promise.resolve(null));

const mockCouponFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

const mockCouponCreate = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "coupon-1" }),
);

const mockCouponUpdate = mock<() => Promise<{ id: string; isActive: boolean }>>(
  () => Promise.resolve({ id: "coupon-1", isActive: true }),
);

const mockCouponUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 1 }),
);

const mockCouponDelete = mock<() => Promise<{ id: string }>>(() =>
  Promise.resolve({ id: "coupon-1" }),
);

const mockReservationCount = mock<() => Promise<number>>(() =>
  Promise.resolve(0),
);

// モジュールモック（import より前に配置）
mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    coupon: {
      findUnique: mockCouponFindUnique,
      findFirst: mockCouponFindFirst,
      create: mockCouponCreate,
      update: mockCouponUpdate,
      updateMany: mockCouponUpdateMany,
      delete: mockCouponDelete,
    },
    reservation: {
      count: mockReservationCount,
    },
  },
}));

import { DomainError } from "@/shared/domain/domain-error";
import {
  createCoupon,
  updateCoupon,
  deleteCoupon,
  toggleCouponActive,
  incrementCouponUsage,
  decrementCouponUsage,
} from "@/shared/domain/coupons/commands";

// テストデータ
const COUPON_ID = "550e8400-e29b-41d4-a716-446655440001";

const VALID_COUPON_DATA = {
  code: "SUMMER2024",
  name: "夏季割引クーポン",
  description: "夏季限定の割引クーポンです",
  type: CouponType.PERCENTAGE,
  discountValue: 10,
  minReservationAmount: 5000,
  maxDiscountAmount: 2000,
  validFrom: new Date("2024-07-01T00:00:00Z"),
  validUntil: new Date("2024-08-31T23:59:59Z"),
  usageLimit: 100,
  isActive: true,
  canCombineWithDurationDiscount: false,
} satisfies Parameters<typeof createCoupon>[0];

describe("coupons/commands", () => {
  beforeEach(() => {
    mockCouponFindUnique.mockReset();
    mockCouponFindFirst.mockReset();
    mockCouponCreate.mockReset();
    mockCouponUpdate.mockReset();
    mockCouponUpdateMany.mockReset();
    mockCouponDelete.mockReset();
    mockReservationCount.mockReset();

    // デフォルト: クーポンが存在しない / 重複なし
    mockCouponFindUnique.mockResolvedValue(null);
    mockCouponFindFirst.mockResolvedValue(null);
    mockCouponCreate.mockResolvedValue({ id: "coupon-1" });
    mockCouponUpdate.mockResolvedValue({ id: COUPON_ID, isActive: true });
    mockCouponUpdateMany.mockResolvedValue({ count: 1 });
    mockCouponDelete.mockResolvedValue({ id: COUPON_ID });
    mockReservationCount.mockResolvedValue(0);
  });

  // =============================================================================
  // createCoupon
  // =============================================================================

  describe("createCoupon", () => {
    describe("正常系", () => {
      test("重複しないコードで作成でき ID を返す", async () => {
        // コード重複チェック: findUnique が null を返す（使用可能）
        mockCouponFindUnique.mockResolvedValueOnce(null);
        mockCouponCreate.mockResolvedValueOnce({ id: "new-coupon-id" });

        const result = await createCoupon(VALID_COUPON_DATA);

        expect(result).toEqual({ id: "new-coupon-id" });
        expect(mockCouponCreate).toHaveBeenCalledTimes(1);
      });

      test("create が正しいデータで呼ばれる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);
        mockCouponCreate.mockResolvedValueOnce({ id: "coupon-1" });

        await createCoupon(VALID_COUPON_DATA);

        expect(mockCouponCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              code: "SUMMER2024",
              name: "夏季割引クーポン",
              type: CouponType.PERCENTAGE,
              discountValue: 10,
              isActive: true,
              canCombineWithDurationDiscount: false,
            }),
          }),
        );
      });

      test("description が省略された場合 null で保存される", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);
        mockCouponCreate.mockResolvedValueOnce({ id: "coupon-1" });

        await createCoupon({
          ...VALID_COUPON_DATA,
          description: undefined,
        });

        expect(mockCouponCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              description: null,
            }),
          }),
        );
      });

      test("FIXED_AMOUNT タイプで作成できる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);
        mockCouponCreate.mockResolvedValueOnce({ id: "coupon-2" });

        const result = await createCoupon({
          ...VALID_COUPON_DATA,
          type: CouponType.FIXED_AMOUNT,
          discountValue: 500,
        });

        expect(result).toEqual({ id: "coupon-2" });
        expect(mockCouponCreate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: expect.objectContaining({
              type: CouponType.FIXED_AMOUNT,
              discountValue: 500,
            }),
          }),
        );
      });
    });

    describe("異常系", () => {
      test("既存のコードで CONFLICT エラーをスローする", async () => {
        // コード重複チェックで既存クーポンを返す
        mockCouponFindUnique.mockResolvedValueOnce({
          id: "existing-id",
          code: "SUMMER2024",
          isActive: true,
        });

        await expect(createCoupon(VALID_COUPON_DATA)).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このクーポンコードは既に使用されています",
        });

        expect(mockCouponCreate).not.toHaveBeenCalled();
      });

      test("CONFLICT エラーは DomainError のインスタンスである", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: "existing-id",
          code: "SUMMER2024",
          isActive: true,
        });

        await expect(createCoupon(VALID_COUPON_DATA)).rejects.toBeInstanceOf(
          DomainError,
        );
      });
    });
  });

  // =============================================================================
  // updateCoupon
  // =============================================================================

  describe("updateCoupon", () => {
    describe("正常系", () => {
      test("存在するクーポンを更新できる（同一コード）", async () => {
        // ensureCouponExists: クーポンが存在する（同一コード）
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });

        await expect(
          updateCoupon(COUPON_ID, VALID_COUPON_DATA),
        ).resolves.toBeUndefined();

        expect(mockCouponUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: COUPON_ID },
            data: expect.objectContaining({
              code: "SUMMER2024",
              name: "夏季割引クーポン",
            }),
          }),
        );
      });

      test("コードを変更する場合に重複チェックが走る", async () => {
        // 既存クーポンは別コード
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "OLDCODE",
          isActive: true,
        });
        // 新コードは他が使用していない
        mockCouponFindFirst.mockResolvedValueOnce(null);

        await expect(
          updateCoupon(COUPON_ID, VALID_COUPON_DATA),
        ).resolves.toBeUndefined();

        // コード変更があったため findFirst でコード重複チェック
        expect(mockCouponFindFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              code: "SUMMER2024",
              NOT: { id: COUPON_ID },
            }),
          }),
        );
      });

      test("同一コードで更新する場合は重複チェックが走らない", async () => {
        // 既存クーポンと同一コード
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });

        await updateCoupon(COUPON_ID, VALID_COUPON_DATA);

        // 同一コードのため findFirst は呼ばれない
        expect(mockCouponFindFirst).not.toHaveBeenCalled();
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);

        await expect(
          updateCoupon(COUPON_ID, VALID_COUPON_DATA),
        ).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "クーポンが見つかりません",
        });

        expect(mockCouponUpdate).not.toHaveBeenCalled();
      });

      test("他のクーポンが使用中のコードで CONFLICT エラーをスローする", async () => {
        // 既存クーポンは別コード
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "OLDCODE",
          isActive: true,
        });
        // 新コードは他のクーポンが使用中
        mockCouponFindFirst.mockResolvedValueOnce({ id: "other-coupon" });

        await expect(
          updateCoupon(COUPON_ID, VALID_COUPON_DATA),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このクーポンコードは既に使用されています",
        });

        expect(mockCouponUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // deleteCoupon
  // =============================================================================

  describe("deleteCoupon", () => {
    describe("正常系", () => {
      test("存在するクーポンを削除できる（予約なし）", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });
        // 予約件数 0
        mockReservationCount.mockResolvedValueOnce(0);

        await expect(deleteCoupon(COUPON_ID)).resolves.toBeUndefined();

        expect(mockCouponDelete).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: COUPON_ID },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);

        await expect(deleteCoupon(COUPON_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "クーポンが見つかりません",
        });

        expect(mockCouponDelete).not.toHaveBeenCalled();
      });

      test("予約で使用中のクーポンは CONFLICT エラーをスローする", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });
        // 3 件の予約で使用中
        mockReservationCount.mockResolvedValueOnce(3);

        await expect(deleteCoupon(COUPON_ID)).rejects.toMatchObject({
          code: "CONFLICT",
        });

        expect(mockCouponDelete).not.toHaveBeenCalled();
      });

      test("予約使用中エラーメッセージに件数が含まれる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });
        mockReservationCount.mockResolvedValueOnce(5);

        await expect(deleteCoupon(COUPON_ID)).rejects.toMatchObject({
          message: expect.stringContaining("5"),
        });
      });

      test("予約 1 件でも削除不可", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });
        mockReservationCount.mockResolvedValueOnce(1);

        await expect(deleteCoupon(COUPON_ID)).rejects.toBeInstanceOf(
          DomainError,
        );
      });
    });
  });

  // =============================================================================
  // toggleCouponActive
  // =============================================================================

  describe("toggleCouponActive", () => {
    describe("正常系", () => {
      test("アクティブなクーポンを非アクティブにできる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: true,
        });
        mockCouponUpdate.mockResolvedValueOnce({
          id: COUPON_ID,
          isActive: false,
        });

        const result = await toggleCouponActive(COUPON_ID);

        expect(result).toEqual({ isActive: false });
        expect(mockCouponUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: COUPON_ID },
            data: { isActive: false },
          }),
        );
      });

      test("非アクティブなクーポンをアクティブにできる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          isActive: false,
        });
        mockCouponUpdate.mockResolvedValueOnce({
          id: COUPON_ID,
          isActive: true,
        });

        const result = await toggleCouponActive(COUPON_ID);

        expect(result).toEqual({ isActive: true });
        expect(mockCouponUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            data: { isActive: true },
          }),
        );
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);

        await expect(toggleCouponActive(COUPON_ID)).rejects.toMatchObject({
          code: "NOT_FOUND",
          message: "クーポンが見つかりません",
        });

        expect(mockCouponUpdate).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // incrementCouponUsage
  // =============================================================================

  describe("incrementCouponUsage", () => {
    describe("正常系", () => {
      test("使用数を 1 インクリメントする", async () => {
        await expect(incrementCouponUsage(COUPON_ID)).resolves.toBeUndefined();

        expect(mockCouponUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: COUPON_ID },
            data: { usageCount: { increment: 1 } },
          }),
        );
      });

      test("update が 1 回だけ呼ばれる", async () => {
        await incrementCouponUsage(COUPON_ID);

        expect(mockCouponUpdate).toHaveBeenCalledTimes(1);
        expect(mockCouponUpdateMany).not.toHaveBeenCalled();
      });
    });
  });

  // =============================================================================
  // decrementCouponUsage
  // =============================================================================

  describe("decrementCouponUsage", () => {
    describe("正常系", () => {
      test("使用数を 1 デクリメントする（usageCount > 0 の場合のみ）", async () => {
        mockCouponUpdateMany.mockResolvedValueOnce({ count: 1 });

        await expect(decrementCouponUsage(COUPON_ID)).resolves.toBeUndefined();

        expect(mockCouponUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: {
              id: COUPON_ID,
              usageCount: { gt: 0 },
            },
            data: { usageCount: { decrement: 1 } },
          }),
        );
      });

      test("updateMany が 1 回だけ呼ばれる", async () => {
        await decrementCouponUsage(COUPON_ID);

        expect(mockCouponUpdateMany).toHaveBeenCalledTimes(1);
        expect(mockCouponUpdate).not.toHaveBeenCalled();
      });

      test("usageCount が 0 の場合はデクリメントしない（updateMany の where 条件で除外）", async () => {
        // count: 0 は where 条件に該当せず updateMany が実行されなかったことを示す
        mockCouponUpdateMany.mockResolvedValueOnce({ count: 0 });

        await expect(decrementCouponUsage(COUPON_ID)).resolves.toBeUndefined();

        // updateMany は呼ばれるが where 条件で 0 件にマッチ → エラーにならない
        expect(mockCouponUpdateMany).toHaveBeenCalledWith(
          expect.objectContaining({
            where: expect.objectContaining({
              usageCount: { gt: 0 },
            }),
          }),
        );
      });
    });
  });
});
