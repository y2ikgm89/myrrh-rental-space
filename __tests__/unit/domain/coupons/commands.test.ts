import { describe, test, expect, mock, beforeEach } from "bun:test";
import { uniqueConstraintError } from "../../../helpers/prisma-errors";

const CouponType = {
  PERCENTAGE: "PERCENTAGE",
  FIXED_AMOUNT: "FIXED_AMOUNT",
} as const;
type CouponType = (typeof CouponType)[keyof typeof CouponType];

const mockCouponFindUnique = mock<
  () => Promise<{
    id: string;
    code: string;
    isActive?: boolean;
    usageCount?: number;
  } | null>
>(() => Promise.resolve(null));

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

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    coupon: {
      findUnique: mockCouponFindUnique,
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
  updateCouponActive,
} from "@/shared/domain/coupons/commands";

const COUPON_ID = "550e8400-e29b-41d4-a716-446655440001";

const VALID_COUPON_DATA = {
  code: "SUMMER2024",
  name: "夏季割引クーポン",
  description: "夏季限定の割引クーポンです",
  type: CouponType.PERCENTAGE,
  discountValue: 10,
  minReservationAmount: 5000,
  maxDiscountAmount: 2000,
  validFrom: "2024-07-01T09:00",
  validUntil: "2024-08-31T23:59",
  usageLimit: 100,
  isActive: true,
  canCombineWithDurationDiscount: false,
} satisfies Parameters<typeof createCoupon>[0];

const P2002_CODE_ERROR = uniqueConstraintError(["code"], "Coupon");

describe("coupons/commands", () => {
  beforeEach(() => {
    mockCouponFindUnique.mockReset();
    mockCouponCreate.mockReset();
    mockCouponUpdate.mockReset();
    mockCouponUpdateMany.mockReset();
    mockCouponDelete.mockReset();
    mockReservationCount.mockReset();

    mockCouponFindUnique.mockResolvedValue(null);
    mockCouponCreate.mockResolvedValue({ id: "coupon-1" });
    mockCouponUpdate.mockResolvedValue({ id: COUPON_ID, isActive: true });
    mockCouponUpdateMany.mockResolvedValue({ count: 1 });
    mockCouponDelete.mockResolvedValue({ id: COUPON_ID });
    mockReservationCount.mockResolvedValue(0);
  });

  describe("createCoupon", () => {
    describe("正常系", () => {
      test("作成でき ID を返す", async () => {
        mockCouponCreate.mockResolvedValueOnce({ id: "new-coupon-id" });

        const result = await createCoupon(VALID_COUPON_DATA);

        expect(result).toEqual({ id: "new-coupon-id" });
        expect(mockCouponCreate).toHaveBeenCalledTimes(1);
      });

      test("create が正しいデータで呼ばれる", async () => {
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
        mockCouponCreate.mockResolvedValueOnce({ id: "coupon-2" });

        const result = await createCoupon({
          ...VALID_COUPON_DATA,
          type: CouponType.FIXED_AMOUNT,
          discountValue: 500,
        });

        expect(result).toEqual({ id: "coupon-2" });
      });
    });

    describe("異常系", () => {
      test("create 時の code unique 制約違反 (P2002) は CONFLICT に変換する", async () => {
        mockCouponCreate.mockRejectedValueOnce(P2002_CODE_ERROR);

        await expect(createCoupon(VALID_COUPON_DATA)).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このクーポンコードは既に使用されています",
        });
      });

      test("CONFLICT エラーは DomainError のインスタンスである", async () => {
        mockCouponCreate.mockRejectedValueOnce(P2002_CODE_ERROR);

        await expect(createCoupon(VALID_COUPON_DATA)).rejects.toBeInstanceOf(
          DomainError,
        );
      });

      test("P2002 だが code 以外の unique 制約はそのまま再スローする", async () => {
        mockCouponCreate.mockRejectedValueOnce(
          uniqueConstraintError(["other_field"], "Coupon"),
        );

        await expect(createCoupon(VALID_COUPON_DATA)).rejects.toMatchObject({
          code: "P2002",
        });
      });
    });
  });

  describe("updateCoupon", () => {
    describe("正常系", () => {
      test("存在するクーポンを更新できる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          usageCount: 0,
        });

        await expect(
          updateCoupon(COUPON_ID, VALID_COUPON_DATA),
        ).resolves.toBeUndefined();

        expect(mockCouponUpdate).toHaveBeenCalledWith(
          expect.objectContaining({
            where: { id: COUPON_ID },
          }),
        );
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

      test("update 時の code unique 制約違反 (P2002) は CONFLICT に変換する", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "OLDCODE",
          usageCount: 0,
        });
        mockCouponUpdate.mockRejectedValueOnce(P2002_CODE_ERROR);

        await expect(
          updateCoupon(COUPON_ID, VALID_COUPON_DATA),
        ).rejects.toMatchObject({
          code: "CONFLICT",
          message: "このクーポンコードは既に使用されています",
        });
      });

      test("usageLimit が usageCount 未満の場合 VALIDATION エラーをスローする", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          usageCount: 50,
        });

        await expect(
          updateCoupon(COUPON_ID, {
            ...VALID_COUPON_DATA,
            usageLimit: 10,
          }),
        ).rejects.toMatchObject({
          code: "VALIDATION",
          message: "利用回数上限は現在の利用回数以上に設定してください",
        });

        expect(mockCouponUpdate).not.toHaveBeenCalled();
      });
    });
  });

  describe("deleteCoupon", () => {
    describe("正常系", () => {
      test("存在するクーポンを削除できる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
          usageCount: 0,
        });

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
    });
  });

  describe("updateCouponActive", () => {
    describe("正常系", () => {
      test("isActive: false を渡すと非アクティブにできる", async () => {
        mockCouponFindUnique.mockResolvedValueOnce({
          id: COUPON_ID,
          code: "SUMMER2024",
        });
        mockCouponUpdate.mockResolvedValueOnce({
          id: COUPON_ID,
          isActive: false,
        });

        const result = await updateCouponActive(COUPON_ID, false);

        expect(result).toEqual({ isActive: false });
      });
    });

    describe("異常系", () => {
      test("存在しない ID で NOT_FOUND エラーをスローする", async () => {
        mockCouponFindUnique.mockResolvedValueOnce(null);

        await expect(updateCouponActive(COUPON_ID, true)).rejects.toMatchObject(
          {
            code: "NOT_FOUND",
            message: "クーポンが見つかりません",
          },
        );

        expect(mockCouponUpdate).not.toHaveBeenCalled();
      });
    });
  });
});
