import { describe, test, expect, mock, beforeEach } from "bun:test";
import { CustomerStatus } from "@generated/prisma/enums";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

mock.module("server-only", () => ({}));

const mockFindMany = mock<
  (args: {
    where: { id: { in: string[] } };
    select: { id: boolean; status: boolean };
  }) => Promise<{ id: string; status: CustomerStatus }[]>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<
  (args: {
    where: { id: { in: string[] } };
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
    test("updateMany に正しい where と data が渡される", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: CustomerStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await bulkSetStatusCustomersCommand([UUID_A], CustomerStatus.VIP);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [UUID_A] } },
        data: { status: CustomerStatus.VIP },
      });
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
