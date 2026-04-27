import { describe, test, expect, mock, beforeEach } from "bun:test";
import { InquiryStatus } from "@generated/prisma/enums";

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

mock.module("server-only", () => ({}));

const mockFindMany = mock<
  (args: {
    where: { id: { in: string[] } };
    select: { id: boolean; status: boolean };
  }) => Promise<{ id: string; status: InquiryStatus }[]>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<
  (args: {
    where: { id: { in: string[] } };
    data: { status: InquiryStatus };
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: {
      findMany: mockFindMany,
      updateMany: mockUpdateMany,
    },
  },
}));

// =============================================================================
// Import target after mocks
// =============================================================================

const { bulkSetStatusInquiriesCommand } =
  await import("@/shared/domain/inquiries/bulk-status-commands");

// =============================================================================
// Fixtures
// =============================================================================

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_C = "33333333-3333-4333-8333-333333333333";

// =============================================================================
// Tests
// =============================================================================

describe("bulkSetStatusInquiriesCommand", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockUpdateMany.mockClear();
  });

  describe("空配列", () => {
    test("空配列で count: 0 を返しDB呼び出しなし", async () => {
      const result = await bulkSetStatusInquiriesCommand(
        [],
        InquiryStatus.RESOLVED,
      );

      expect(result).toEqual({
        count: 0,
        newStatus: InquiryStatus.RESOLVED,
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
        { id: UUID_A, status: InquiryStatus.RESOLVED },
      ]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.RESOLVED,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("forward-only 遷移検証", () => {
    test("NEW → IN_PROGRESS への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.IN_PROGRESS,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
      expect(result.rejectedIds).toEqual([]);
    });

    test("NEW → RESOLVED への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.RESOLVED,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
    });

    test("IN_PROGRESS → RESOLVED への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.IN_PROGRESS },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.RESOLVED,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
    });

    test("RESOLVED → CLOSED への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.RESOLVED },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.CLOSED,
      );

      expect(result.count).toBe(1);
    });

    test("RESOLVED → NEW は backward 遷移のため rejectedIds に積まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.RESOLVED },
      ]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.NEW,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([UUID_A]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("RESOLVED → IN_PROGRESS は backward 遷移のため rejectedIds に積まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.RESOLVED },
      ]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.IN_PROGRESS,
      );

      expect(result.count).toBe(0);
      expect(result.rejectedIds).toEqual([UUID_A]);
    });

    test("CLOSED は terminal のため任意遷移がすべて rejectedIds に積まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.CLOSED },
        { id: UUID_B, status: InquiryStatus.CLOSED },
      ]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A, UUID_B],
        InquiryStatus.RESOLVED,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([UUID_A, UUID_B]);
    });

    test("混在（一部 valid / 一部 backward）の場合", async () => {
      // UUID_A: NEW → RESOLVED (valid forward)
      // UUID_B: CLOSED → RESOLVED (backward = rejected)
      // UUID_C: IN_PROGRESS → RESOLVED (valid forward)
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
        { id: UUID_B, status: InquiryStatus.CLOSED },
        { id: UUID_C, status: InquiryStatus.IN_PROGRESS },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A, UUID_B, UUID_C],
        InquiryStatus.RESOLVED,
      );

      expect(result.count).toBe(2);
      expect(result.affectedIds).toEqual([UUID_A, UUID_C]);
      expect(result.rejectedIds).toEqual([UUID_B]);
    });
  });

  describe("戻り値の構造", () => {
    test("newStatus が戻り値に含まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.CLOSED,
      );

      expect(result.newStatus).toBe(InquiryStatus.CLOSED);
    });
  });
});
