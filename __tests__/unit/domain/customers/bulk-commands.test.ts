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
    customer: {
      findMany: () => mockFindMany(),
      updateMany: () => mockUpdateMany(),
      deleteMany: () => mockDeleteMany(),
    },
  },
}));

const { bulkToggleActiveCustomersCommand, bulkDeleteCustomersCommand } =
  await import("@/shared/domain/customers/bulk-commands");

const CUSTOMER_A = { id: "11111111-1111-4111-8111-111111111111" };
const CUSTOMER_B = { id: "22222222-2222-4222-8222-222222222222" };

describe("bulkToggleActiveCustomersCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkToggleActiveCustomersCommand([], true);

      expect(result).toEqual({
        count: 0,
        isActive: true,
        affectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件 isActive: true で有効化成功", async () => {
      mockFindMany.mockResolvedValueOnce([CUSTOMER_A, CUSTOMER_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkToggleActiveCustomersCommand(
        [CUSTOMER_A.id, CUSTOMER_B.id],
        true,
      );

      expect(result).toEqual({
        count: 2,
        isActive: true,
        affectedIds: [CUSTOMER_A.id, CUSTOMER_B.id],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
    });

    test("isActive: false で無効化成功", async () => {
      mockFindMany.mockResolvedValueOnce([CUSTOMER_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkToggleActiveCustomersCommand(
        [CUSTOMER_A.id],
        false,
      );

      expect(result.isActive).toBe(false);
      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([CUSTOMER_A.id]);
    });

    test("対象が見つからない場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkToggleActiveCustomersCommand(
        [CUSTOMER_A.id],
        true,
      );

      expect(result).toEqual({
        count: 0,
        isActive: true,
        affectedIds: [],
      });
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });
});

describe("bulkDeleteCustomersCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockDeleteMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteCustomersCommand([]);

      expect(result).toEqual({
        count: 0,
        affectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    test("複数件削除成功で count と affectedIds を返す", async () => {
      mockFindMany.mockResolvedValueOnce([CUSTOMER_A, CUSTOMER_B]);
      mockDeleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkDeleteCustomersCommand([
        CUSTOMER_A.id,
        CUSTOMER_B.id,
      ]);

      expect(result).toEqual({
        count: 2,
        affectedIds: [CUSTOMER_A.id, CUSTOMER_B.id],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    });

    test("対象が見つからない場合は count: 0 を返し deleteMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkDeleteCustomersCommand([CUSTOMER_A.id]);

      expect(result).toEqual({
        count: 0,
        affectedIds: [],
      });
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });
  });
});
