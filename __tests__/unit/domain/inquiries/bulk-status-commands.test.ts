import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Enum stub (FLAGGED / SPAM 追加後の 6 値)
//
// helpers.ts が `@generated/prisma/enums` から多数の enum を transitive import する
// ため、`mock.module` は spread 前提で作る（override は InquiryStatus のみ）。
// =============================================================================

const InquiryStatus = {
  NEW: "NEW",
  IN_PROGRESS: "IN_PROGRESS",
  RESOLVED: "RESOLVED",
  CLOSED: "CLOSED",
  FLAGGED: "FLAGGED",
  SPAM: "SPAM",
} as const;
type InquiryStatus = (typeof InquiryStatus)[keyof typeof InquiryStatus];

const actualEnums = await import("@generated/prisma/enums");

// =============================================================================
// Mocks (must be defined before importing target module)
// =============================================================================

mock.module("server-only", () => ({}));

const mockFindMany = mock<
  (args: {
    where: {
      id: { in: string[] };
      deletedAt?: null;
      status?: InquiryStatus;
    };
    select: { id: boolean; status?: boolean };
  }) => Promise<{ id: string; status?: InquiryStatus }[]>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<
  (args: {
    where: {
      deletedAt?: null;
      OR?: { id: string; status: InquiryStatus }[];
      id?: { in: string[] };
    };
    data: { status: InquiryStatus };
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const mockStatusHistoryCreateMany = mock<
  (args: {
    data: Array<{
      inquiryId: string;
      fromStatus: InquiryStatus;
      toStatus: InquiryStatus;
      changedById: string | null;
      reason: string | null;
    }>;
  }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

const prismaInquiry = {
  findMany: mockFindMany,
  updateMany: mockUpdateMany,
};
const prismaInquiryStatusHistory = { createMany: mockStatusHistoryCreateMany };

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    inquiry: prismaInquiry,
    inquiryStatusHistory: prismaInquiryStatusHistory,
    $transaction: <T>(
      fn: (tx: {
        inquiry: typeof prismaInquiry;
        inquiryStatusHistory: typeof prismaInquiryStatusHistory;
      }) => Promise<T>,
    ) =>
      fn({
        inquiry: prismaInquiry,
        inquiryStatusHistory: prismaInquiryStatusHistory,
      }),
  },
}));

mock.module("@generated/prisma/enums", () => ({
  ...actualEnums,
  InquiryStatus,
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
const CHANGED_BY = "99999999-9999-4999-8999-999999999999";

// =============================================================================
// Tests
// =============================================================================

describe("bulkSetStatusInquiriesCommand", () => {
  beforeEach(() => {
    mockFindMany.mockClear();
    mockUpdateMany.mockClear();
    mockStatusHistoryCreateMany.mockClear();
  });

  describe("空配列", () => {
    test("空配列で count: 0 を返しDB呼び出しなし", async () => {
      const result = await bulkSetStatusInquiriesCommand(
        [],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
      );

      expect(result).toEqual({
        count: 0,
        newStatus: InquiryStatus.RESOLVED,
        affectedIds: [],
        rejectedIds: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockStatusHistoryCreateMany).not.toHaveBeenCalled();
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
        CHANGED_BY,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
      expect(mockStatusHistoryCreateMany).not.toHaveBeenCalled();
    });
  });

  describe("状態遷移検証", () => {
    test("NEW → IN_PROGRESS への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.IN_PROGRESS,
        CHANGED_BY,
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
        CHANGED_BY,
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
        CHANGED_BY,
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
        CHANGED_BY,
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
        CHANGED_BY,
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
        CHANGED_BY,
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
        CHANGED_BY,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(result.rejectedIds).toEqual([UUID_A, UUID_B]);
    });

    test("混在（一部 valid / 一部 backward）の場合", async () => {
      // UUID_A: NEW → RESOLVED (valid)
      // UUID_B: CLOSED → RESOLVED (backward = rejected)
      // UUID_C: IN_PROGRESS → RESOLVED (valid)
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
        { id: UUID_B, status: InquiryStatus.CLOSED },
        { id: UUID_C, status: InquiryStatus.IN_PROGRESS },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A, UUID_B, UUID_C],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
      );

      expect(result.count).toBe(2);
      expect(result.affectedIds).toEqual([UUID_A, UUID_C]);
      expect(result.rejectedIds).toEqual([UUID_B]);
    });
  });

  describe("新遷移: FLAGGED / SPAM", () => {
    test("NEW → FLAGGED が許可される", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.FLAGGED,
        CHANGED_BY,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
    });

    test("NEW → SPAM が許可される", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.SPAM,
        CHANGED_BY,
      );

      expect(result.count).toBe(1);
    });

    test("FLAGGED → NEW への逆方向遷移が許可される (reversible)", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.FLAGGED },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.NEW,
        CHANGED_BY,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
    });

    test("FLAGGED → SPAM への遷移が許可される", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.FLAGGED },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.SPAM,
        CHANGED_BY,
      );

      expect(result.count).toBe(1);
    });

    test("SPAM → CLOSED は許可される (誤判定訂正)", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.SPAM },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.CLOSED,
        CHANGED_BY,
      );

      expect(result.count).toBe(1);
    });

    test("SPAM → NEW は禁止で rejectedIds に積まれる", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.SPAM },
      ]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.NEW,
        CHANGED_BY,
      );

      expect(result.count).toBe(0);
      expect(result.rejectedIds).toEqual([UUID_A]);
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("StatusHistory 記録", () => {
    test("成功遷移時に InquiryStatusHistory.createMany が呼ばれる (changedById + reason 反映)", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
        { id: UUID_B, status: InquiryStatus.IN_PROGRESS },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      await bulkSetStatusInquiriesCommand(
        [UUID_A, UUID_B],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
        "bulk-close",
      );

      expect(mockStatusHistoryCreateMany).toHaveBeenCalledTimes(1);
      expect(mockStatusHistoryCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              inquiryId: UUID_A,
              fromStatus: InquiryStatus.NEW,
              toStatus: InquiryStatus.RESOLVED,
              changedById: CHANGED_BY,
              reason: "bulk-close",
            }),
            expect.objectContaining({
              inquiryId: UUID_B,
              fromStatus: InquiryStatus.IN_PROGRESS,
              toStatus: InquiryStatus.RESOLVED,
              changedById: CHANGED_BY,
              reason: "bulk-close",
            }),
          ]),
        }),
      );
    });

    test("changedById に null (システム経路) を渡すと history に null が保存される", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.RESOLVED,
        null,
      );

      expect(mockStatusHistoryCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.arrayContaining([
            expect.objectContaining({
              inquiryId: UUID_A,
              changedById: null,
              reason: null,
            }),
          ]),
        }),
      );
    });

    test("全件 rejected の場合は StatusHistory.createMany が呼ばれない", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.CLOSED },
      ]);

      await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
      );

      expect(mockStatusHistoryCreateMany).not.toHaveBeenCalled();
    });

    test("claim が一部失敗した場合、実際に遷移できた id だけ StatusHistory に記録される", async () => {
      // Round-5 audit Finding #6: read〜claim 間に別 admin が UUID_B の状態を
      // 変えていた想定。claim できなかった id を history に書くと「実際には
      // 起きていない遷移」の偽レコードが append-only な監査証跡に残るため、
      // 実際に claim できた UUID_A のみが history 対象になることを固定する。
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
        { id: UUID_B, status: InquiryStatus.IN_PROGRESS },
      ]);
      // 2件 claim を試みたが 1 件しか claim できなかった
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });
      // 実際に RESOLVED になっているのは UUID_A のみ
      mockFindMany.mockResolvedValueOnce([{ id: UUID_A }]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A, UUID_B],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
      );

      expect(result.count).toBe(1);
      expect(result.affectedIds).toEqual([UUID_A]);
      expect(result.rejectedIds).toEqual([UUID_B]);
      expect(mockStatusHistoryCreateMany).toHaveBeenCalledTimes(1);
      expect(mockStatusHistoryCreateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: [
            expect.objectContaining({
              inquiryId: UUID_A,
              fromStatus: InquiryStatus.NEW,
              toStatus: InquiryStatus.RESOLVED,
            }),
          ],
        }),
      );
    });
  });

  describe("soft-deleted 除外", () => {
    test("findMany の where 条件に deletedAt: null が含まれる", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
      );

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [UUID_A] },
            deletedAt: null,
          }),
        }),
      );
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
        CHANGED_BY,
      );

      expect(result.newStatus).toBe(InquiryStatus.CLOSED);
    });
  });
});
