import { describe, test, expect, mock, beforeEach } from "bun:test";
import { EventStatus } from "@generated/prisma/enums";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

mock.module("server-only", () => ({}));

const mockFindMany = mock<
  (args: {
    where: { id: { in: string[] }; deletedAt: null };
    select: { id: boolean; status: boolean };
  }) => Promise<{ id: string; status: EventStatus }[]>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<
  (args: {
    where: { id: { in: string[] }; deletedAt: null };
    data: { status: EventStatus };
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  },
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { bulkSetStatusEventsCommand } =
  await import("@/shared/domain/events/bulk-status-commands");

// =============================================================================
// Fixtures
// =============================================================================

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

// =============================================================================
// Tests
// =============================================================================

describe("bulkSetStatusEventsCommand", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockUpdateMany.mockClear();
  });

  describe("空配列", () => {
    test("空配列で count: 0 を返しDB呼び出しなし", async () => {
      const result = await bulkSetStatusEventsCommand(
        [],
        EventStatus.CANCELLED,
      );

      expect(result).toEqual({
        count: 0,
        newStatus: EventStatus.CANCELLED,
        affectedIds: [],
        rejectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("soft-delete 済みは対象外", () => {
    test("findMany の where に deletedAt: null が含まれる", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await bulkSetStatusEventsCommand([UUID_A], EventStatus.CANCELLED);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({ deletedAt: null }),
        }),
      );
    });

    test("soft-deleted ID が findMany で返らない場合 count: 0", async () => {
      // findMany が空を返す = soft-deleted として扱われた
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.CANCELLED,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("no-op skip（同一ステータス）", () => {
    test("同一ステータスへの変更は no-op でスキップ", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.CANCELLED },
      ]);

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.CANCELLED,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("EVENT_STATUS_TRANSITIONS 遷移検証", () => {
    test("DRAFT → PUBLISHED への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.DRAFT },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.PUBLISHED,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
      expect(result.rejectedIds).toEqual([]);
    });

    test("DRAFT → CANCELLED への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.DRAFT },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.CANCELLED,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
    });

    test("PUBLISHED → CANCELLED への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.PUBLISHED },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.CANCELLED,
      );

      expect(result.count).toBe(1);
    });

    test("ARCHIVED は terminal のため CANCELLED への遷移が rejectedIds に積まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.ARCHIVED },
      ]);

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.CANCELLED,
      );

      expect(result.count).toBe(0);
      expect(result.rejectedIds).toEqual([UUID_A]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("CANCELLED → DRAFT への backward 遷移は rejectedIds に積まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.CANCELLED },
      ]);

      const result = await bulkSetStatusEventsCommand(
        [UUID_A],
        EventStatus.DRAFT,
      );

      expect(result.count).toBe(0);
      expect(result.rejectedIds).toEqual([UUID_A]);
    });

    test("混在（valid + rejected）の場合", async () => {
      // UUID_A: DRAFT → CANCELLED (valid)
      // UUID_B: ARCHIVED → CANCELLED (rejected, terminal)
      // UUID_C: PUBLISHED → CANCELLED (valid)
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.DRAFT },
        { id: UUID_B, status: EventStatus.ARCHIVED },
        { id: UUID_C, status: EventStatus.PUBLISHED },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkSetStatusEventsCommand(
        [UUID_A, UUID_B, UUID_C],
        EventStatus.CANCELLED,
      );

      expect(result.count).toBe(2);
      expect(result.affectedIds).toEqual([UUID_A, UUID_C]);
      expect(result.rejectedIds).toEqual([UUID_B]);
    });
  });

  describe("updateMany への引数", () => {
    test("updateMany に deletedAt: null を含む where が渡される", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: EventStatus.DRAFT },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await bulkSetStatusEventsCommand([UUID_A], EventStatus.CANCELLED);

      expect(mockUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [UUID_A] }, deletedAt: null },
        data: { status: EventStatus.CANCELLED },
      });
    });
  });
});
