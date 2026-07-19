import { describe, test, expect, mock, beforeEach } from "bun:test";

// Medium #23 対応: bulkDeleteInquiriesCommand は hard delete ではなく soft delete。
// prisma.inquiry.updateMany で deletedAt をセットする（削除済みは対象外）。

const mockFindMany = mock<
  (args: {
    where: { id: { in: string[] }; deletedAt: null };
    select: { id: boolean };
  }) => Promise<Array<{ id: string }>>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<
  (args: {
    where: { id: { in: string[] } };
    data: { deletedAt: Date };
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
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
    mockUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteInquiriesCommand([]);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件 soft delete 成功で count と affectedIds を返し updateMany に deletedAt が渡る", async () => {
      mockFindMany.mockResolvedValueOnce([INQUIRY_A, INQUIRY_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkDeleteInquiriesCommand([
        INQUIRY_A.id,
        INQUIRY_B.id,
      ]);

      expect(result).toEqual({
        count: 2,
        affectedIds: [INQUIRY_A.id, INQUIRY_B.id],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [INQUIRY_A.id, INQUIRY_B.id] },
          }),
          data: expect.objectContaining({
            deletedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("findMany で deletedAt: null を where 条件として渡す（既 soft-deleted を除外）", async () => {
      mockFindMany.mockResolvedValueOnce([INQUIRY_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await bulkDeleteInquiriesCommand([INQUIRY_A.id]);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [INQUIRY_A.id] },
            deletedAt: null,
          }),
        }),
      );
    });

    test("対象が見つからない場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkDeleteInquiriesCommand([INQUIRY_A.id]);

      expect(result).toEqual({ count: 0, affectedIds: [] });
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("単一件 soft delete も成功する", async () => {
      mockFindMany.mockResolvedValueOnce([INQUIRY_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkDeleteInquiriesCommand([INQUIRY_A.id]);

      expect(result).toEqual({ count: 1, affectedIds: [INQUIRY_A.id] });
    });
  });
});
