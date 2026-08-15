import { describe, test, expect, mock, beforeEach } from "bun:test";
import { installPrismaEnumsMock } from "../../../support/prisma-enums-mock";

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

const mockUpdateManyAndReturn = mock<
  (args: {
    where: {
      deletedAt?: null;
      OR?: { id: string; status: InquiryStatus }[];
    };
    data: { status: InquiryStatus };
    select: { id: boolean };
  }) => Promise<{ id: string }[]>
>(() => Promise.resolve([]));

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
  updateManyAndReturn: mockUpdateManyAndReturn,
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

await installPrismaEnumsMock({
  ...actualEnums,
  InquiryStatus,
});

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
    mockFindMany.mockReset();
    mockFindMany.mockImplementation(() => Promise.resolve([]));
    mockUpdateMany.mockReset();
    mockUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
    mockUpdateManyAndReturn.mockReset();
    mockUpdateManyAndReturn.mockImplementation(() => Promise.resolve([]));
    mockStatusHistoryCreateMany.mockReset();
    mockStatusHistoryCreateMany.mockImplementation(() =>
      Promise.resolve({ count: 0 }),
    );
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
      expect(mockUpdateManyAndReturn).not.toHaveBeenCalled();
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
      expect(mockUpdateManyAndReturn).not.toHaveBeenCalled();
      expect(mockStatusHistoryCreateMany).not.toHaveBeenCalled();
    });
  });

  describe("状態遷移検証", () => {
    test("NEW → IN_PROGRESS への遷移", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
      ]);
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([
        { id: UUID_A },
        { id: UUID_C },
      ]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      expect(mockUpdateManyAndReturn).not.toHaveBeenCalled();
    });
  });

  describe("StatusHistory 記録", () => {
    test("成功遷移時に InquiryStatusHistory.createMany が呼ばれる (changedById + reason 反映)", async () => {
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
        { id: UUID_B, status: InquiryStatus.IN_PROGRESS },
      ]);
      mockUpdateManyAndReturn.mockResolvedValueOnce([
        { id: UUID_A },
        { id: UUID_B },
      ]);

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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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
      // 2件 claim を試みたが RETURNING は UUID_A のみ
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

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

    test("claim が 0 件で全件が既に newStatus のとき StatusHistory.createMany は呼ばれない", async () => {
      // F-122: 並行相手が同じ newStatus をセットしたあと、この actor の
      // claim は 0 件。フォールバック findMany({ status: newStatus }) は
      // 相手の書き込み結果を返すため、旧実装はそれらを自分の confirmed と
      // 誤認し append-only な履歴に偽行を書く。
      mockFindMany.mockResolvedValueOnce([
        { id: UUID_A, status: InquiryStatus.NEW },
        { id: UUID_B, status: InquiryStatus.NEW },
      ]);
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });
      mockUpdateManyAndReturn.mockResolvedValueOnce([]);
      mockFindMany.mockResolvedValueOnce([{ id: UUID_A }, { id: UUID_B }]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A, UUID_B],
        InquiryStatus.RESOLVED,
        CHANGED_BY,
      );

      expect(result.count).toBe(0);
      expect(result.affectedIds).toEqual([]);
      expect(mockStatusHistoryCreateMany).not.toHaveBeenCalled();
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
      mockUpdateManyAndReturn.mockResolvedValueOnce([{ id: UUID_A }]);

      const result = await bulkSetStatusInquiriesCommand(
        [UUID_A],
        InquiryStatus.CLOSED,
        CHANGED_BY,
      );

      expect(result.newStatus).toBe(InquiryStatus.CLOSED);
    });
  });
});
