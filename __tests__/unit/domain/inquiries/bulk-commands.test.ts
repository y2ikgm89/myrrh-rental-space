import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock<() => Promise<Array<{ id: string }>>>(() =>
  Promise.resolve([]),
);

const mockDeleteMany = mock<() => Promise<{ count: number }>>(() =>
  Promise.resolve({ count: 0 }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: {
      findMany: () => mockFindMany(),
      deleteMany: () => mockDeleteMany(),
    },
  },
}));

const { bulkDeleteInquiriesCommand } =
  await import("@/shared/domain/inquiries/bulk-commands");

const INQUIRY_A = { id: "11111111-1111-4111-8111-111111111111" };
const INQUIRY_B = { id: "22222222-2222-4222-8222-222222222222" };

describe("bulkDeleteInquiriesCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockDeleteMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteInquiriesCommand([]);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    test("複数件削除成功で count と affectedIds を返す", async () => {
      mockFindMany.mockResolvedValueOnce([INQUIRY_A, INQUIRY_B]);
      mockDeleteMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkDeleteInquiriesCommand([
        INQUIRY_A.id,
        INQUIRY_B.id,
      ]);

      expect(result).toEqual({
        count: 2,
        affectedIds: [INQUIRY_A.id, INQUIRY_B.id],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockDeleteMany).toHaveBeenCalledTimes(1);
    });

    test("対象が見つからない場合は count: 0 を返し deleteMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkDeleteInquiriesCommand([INQUIRY_A.id]);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockDeleteMany).not.toHaveBeenCalled();
    });

    test("単一件削除も成功する", async () => {
      mockFindMany.mockResolvedValueOnce([INQUIRY_A]);
      mockDeleteMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkDeleteInquiriesCommand([INQUIRY_A.id]);

      expect(result).toEqual({ count: 1, affectedIds: [INQUIRY_A.id] });
    });
  });
});
