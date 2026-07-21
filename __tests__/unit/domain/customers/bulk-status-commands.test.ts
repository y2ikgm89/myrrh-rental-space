import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

mock.module("server-only", () => ({}));

const mockFindMany = mock<
  (args: {
    where: { id: { in: string[] }; status?: CustomerStatus };
    select: { id: boolean; status?: boolean };
  }) => Promise<{ id: string; status?: CustomerStatus }[]>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<
  (args: {
    where: { OR: { id: string; status: CustomerStatus }[] };
    data: { status: CustomerStatus };
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    customer: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  },
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { bulkSetStatusCustomersCommand } =
  await import("@/shared/domain/customers/bulk-status-commands");

// =============================================================================
// Fixtures
// =============================================================================

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

// =============================================================================
// Tests
// =============================================================================

describe("bulkSetStatusCustomersCommand", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockUpdateMany.mockClear();
  });

  describe("空配列", () => {
    test("空配列で count: 0 を返しDB呼び出しなし", async () => {
      const result = await bulkSetStatusCustomersCommand(
        [],
        CustomerStatus.REGULAR,
      );

      expect(result).toEqual({
        count: 0,
        newStatus: CustomerStatus.REGULAR,
        affectedIds: [],
        affected: [],
        rejectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("no-op skip（同一ステータス）", () => {
    test("同一ステータスへの変更は no-op でスキップされ count: 0", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.REGULAR },
      ]);

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A],
        CustomerStatus.REGULAR,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("一部が同一ステータス・一部が変更可能な場合", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.REGULAR },
        { id: UUID_B, status: CustomerStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A, UUID_B],
        CustomerStatus.REGULAR,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_B]);
      expect(result.rejectedIds).toEqual([]);
    });
  });

  describe("任意遷移（CUSTOMER_STATUS_TRANSITIONS）", () => {
    test("NEW → REGULAR への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A],
        CustomerStatus.REGULAR,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
      expect(result.rejectedIds).toEqual([]);
    });

    test("NEW → VIP への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A],
        CustomerStatus.VIP,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
    });

    test("BLACKLIST → REGULAR への遷移（制限なし）", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.BLACKLIST },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A],
        CustomerStatus.REGULAR,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
      expect(result.rejectedIds).toEqual([]);
    });

    test("VIP → BLACKLIST への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.VIP },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A],
        CustomerStatus.BLACKLIST,
      );

      expect(result.count).toBe(1);
    });

    test("複数 ID の一括変更", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
        { id: UUID_B, status: CustomerStatus.REGULAR },
        { id: UUID_C, status: CustomerStatus.INACTIVE },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 3 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A, UUID_B, UUID_C],
        CustomerStatus.VIP,
      );

      expect(result.count).toBe(3);
      expect(result.affectedIds).toEqual([UUID_A, UUID_B, UUID_C]);
      expect(result.rejectedIds).toEqual([]);
    });
  });

  describe("updateMany への引数", () => {
    test("updateMany に read 時点の status を claim する OR where が渡される", async () => {
      // Round-5 audit Finding #5/#6 と同型: WHERE が id のみだと read〜write 間の
      // 競合更新を無条件に上書きする TOCTOU になるため、read 時点の status を
      // OR 条件に含めた claim になっていることを固定する。
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await bulkSetStatusCustomersCommand([UUID_A], CustomerStatus.VIP);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { OR: [{ id: UUID_A, status: CustomerStatus.NEW }] },
        data: { status: CustomerStatus.VIP },
      });
    });

    test("claim が一部失敗した場合、確定できた id だけ affected/affectedIds に残る", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
        { id: UUID_B, status: CustomerStatus.REGULAR },
      ]);
      // 2件 claim を試みたが、他 admin との競合で 1 件しか claim できなかった
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });
      // 実際に VIP になっているのは UUID_A のみ
      mockFindMany.mockResolvedValueOnce([{ id: UUID_A }]);

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A, UUID_B],
        CustomerStatus.VIP,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
      expect(result.affected).toEqual([
        { id: UUID_A, previousStatus: CustomerStatus.NEW },
      ]);
      expect(result.rejectedIds).toEqual([UUID_B]);
    });
  });

  describe("戻り値の構造", () => {
    test("newStatus が戻り値に含まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusCustomersCommand(
        [UUID_A],
        CustomerStatus.INACTIVE,
      );

      expect(result.newStatus).toBe(CustomerStatus.INACTIVE);
    });
  });
});
