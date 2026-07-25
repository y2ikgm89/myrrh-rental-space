import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([]),
);

const mockUpdateMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

const mockDeleteMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    coupon: {
      findMany: () => mockFindMany(),
      updateMany: () => mockUpdateMany(),
      deleteMany: () => mockDeleteMany(),
    },
  },
}));

const { bulkToggleActiveCouponsCommand, bulkDeleteCouponsCommand } =
  await import("@/shared/domain/coupons/bulk-commands");
const { DomainError } = await import("@/shared/domain/domain-error");

const COUPON_A = {
  id: "11111111-1111-4111-8111-111111111111",
  code: "SAVE10",
  name: "10%オフ",
};
const COUPON_B = {
  id: "22222222-2222-4222-8222-222222222222",
  code: "SAVE20",
  name: "20%オフ",
};

describe("bulkToggleActiveCouponsCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkToggleActiveCouponsCommand([], true);

      expect(result).toEqual({
        count: 0,
        isActive: true,
        affectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件 isActive=true で count と affectedIds を返す", async () => {
      mockFindMany.mockResolvedValueOnce([COUPON_A, COUPON_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkToggleActiveCouponsCommand(
        [COUPON_A.id, COUPON_B.id],
        true,
      );

      expect(result).toEqual({
        count: 2,
        isActive: true,
        affectedIds: [COUPON_A.id, COUPON_B.id],
      });
    });
  });

  describe("異常系", () => {
    test("ids 指定だが対象が見つからない場合は NOT_FOUND をスローする", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await expect(
        bulkToggleActiveCouponsCommand([COUPON_A.id], true),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "対象のクーポンが見つかりません",
      });

      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });
});

describe("bulkDeleteCouponsCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockDeleteMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteCouponsCommand([]);

      expect(result).toEqual({
        count: 0,
        affectedIds: [],
        deleted: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    test("複数件削除成功で count と affectedIds を返す", async () => {
      mockFindMany.mockResolvedValueOnce([COUPON_A, COUPON_B]);
      mockDeleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkDeleteCouponsCommand([COUPON_A.id, COUPON_B.id]);

      expect(result).toEqual({
        count: 2,
        affectedIds: [COUPON_A.id, COUPON_B.id],
        deleted: [COUPON_A, COUPON_B],
      });
    });
  });

  describe("異常系", () => {
    test("ids 指定だが対象が見つからない場合は NOT_FOUND をスローする", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await expect(
        bulkDeleteCouponsCommand([COUPON_A.id]),
      ).rejects.toMatchObject({
        code: "NOT_FOUND",
        message: "対象のクーポンが見つかりません",
      });

      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });
});
