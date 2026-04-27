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

const COUPON_A = { id: "11111111-1111-4111-8111-111111111111" };
const COUPON_B = { id: "22222222-2222-4222-8222-222222222222" };

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
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    });

    test("isActive=false で無効化", async () => {
      mockFindMany.mockResolvedValueOnce([COUPON_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkToggleActiveCouponsCommand([COUPON_A.id], false);

      expect(result.isActive).toBe(false);
      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([COUPON_A.id]);
    });

    test("対象が見つからない場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkToggleActiveCouponsCommand([COUPON_A.id], true);

      expect(result).toEqual({
        count: 0,
        isActive: true,
        affectedIds: [],
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
      });
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    });

    test("対象が見つからない場合は count: 0 を返し deleteMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkDeleteCouponsCommand([COUPON_A.id]);

      expect(result).toEqual({
        count: 0,
        affectedIds: [],
      });
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });
});
