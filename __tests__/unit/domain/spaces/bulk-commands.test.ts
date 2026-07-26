import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock<
  (_args?: unknown) => Promise<Array<{ id: string; slug: string }>>
>(() => Promise.resolve([]));

const mockUpdateMany = mock<(_args?: unknown) => Promise<{ count: number }>>(
  () => Promise.resolve({ count: 0 }),
);

const mockReservationFindMany = mock<
  (_args?: unknown) => Promise<Array<{ spaceId: string }>>
>(() => Promise.resolve([]));

const mockEventFindMany = mock<
  (_args?: unknown) => Promise<Array<{ spaceId: string | null }>>
>(() => Promise.resolve([]));

const mockDelete = mock<(args: { where: { id: string } }) => Promise<unknown>>(
  () => Promise.resolve({}),
);

const mockExecuteRaw = mock(() => Promise.resolve(0));

const mockTransaction = mock(
  async <T>(fn: (tx: unknown) => Promise<T>): Promise<T> =>
    fn({
      space: {
        updateMany: (args: unknown) => mockUpdateMany(args),
      },
      reservation: {
        findMany: (args: unknown) => mockReservationFindMany(args),
      },
      event: {
        findMany: (args: unknown) => mockEventFindMany(args),
      },
      $executeRaw: mockExecuteRaw,
    }),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/lib/validations/enums/helpers", () => ({
  ACTIVE_RESERVATION_STATUSES: ["PENDING", "CONFIRMED"],
}));

mock.module("@/shared/domain/spaces/overlap", () => ({
  ACTIVE_EVENT_STATUSES: ["DRAFT", "PUBLISHED"],
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: (args: unknown) => mockFindMany(args),
      updateMany: (args: unknown) => mockUpdateMany(args),
      delete: (args: { where: { id: string } }) => mockDelete(args),
    },
    reservation: {
      findMany: (args: unknown) => mockReservationFindMany(args),
    },
    event: {
      findMany: (args: unknown) => mockEventFindMany(args),
    },
    $transaction: mockTransaction,
  },
}));

class FakePrismaKnownRequestError extends Error {
  code: string;
  constructor(message: string, code: string) {
    super(message);
    this.name = "PrismaClientKnownRequestError";
    this.code = code;
  }
}

mock.module("@generated/prisma/client", () => ({
  Prisma: {
    PrismaClientKnownRequestError: FakePrismaKnownRequestError,
  },
}));

const { bulkTogglePublishedSpacesCommand, bulkDeleteSpacesCommand } =
  await import("@/shared/domain/spaces/bulk-commands");

const SPACE_A = { id: "11111111-1111-4111-8111-111111111111", slug: "space-a" };
const SPACE_B = { id: "22222222-2222-4222-8222-222222222222", slug: "space-b" };
const SPACE_C = { id: "33333333-3333-4333-8333-333333333333", slug: "space-c" };

describe("bulkTogglePublishedSpacesCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkTogglePublishedSpacesCommand([], true);

      expect(result).toEqual({
        count: 0,
        isPublished: true,
        affected: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件 publish 成功で count と affected を返す", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A, SPACE_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });

      const result = await bulkTogglePublishedSpacesCommand(
        [SPACE_A.id, SPACE_B.id],
        true,
      );

      expect(result).toEqual({
        count: 2,
        isPublished: true,
        affected: [SPACE_A, SPACE_B],
      });
      expect(mockFindMany).toHaveBeenCalledTimes(1);
      expect(mockUpdateMany).toHaveBeenCalledTimes(2);
    });

    test("publish 対象は active なスペースだけに限定する", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });
      mockUpdateMany.mockResolvedValueOnce({ count: 0 });

      await bulkTogglePublishedSpacesCommand([SPACE_A.id], true);

      expect(mockFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [SPACE_A.id] }, isActive: true },
        }),
      );
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: {
            id: { in: [SPACE_A.id] },
            isActive: true,
            publishedAt: null,
          },
        }),
      );
    });

    test("初回公開と再公開で publishedAt の扱いを分ける", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A, SPACE_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      await bulkTogglePublishedSpacesCommand([SPACE_A.id, SPACE_B.id], true);

      expect(mockUpdateMany).toHaveBeenNthCalledWith(
        1,
        expect.objectContaining({
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
      expect(mockUpdateMany).toHaveBeenNthCalledWith(
        2,
        expect.objectContaining({
          where: expect.objectContaining({
            publishedAt: { not: null },
          }),
          data: { isPublished: true },
        }),
      );
    });

    test("publish: false で非公開化（publishedAt: null）", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkTogglePublishedSpacesCommand(
        [SPACE_A.id],
        false,
      );

      expect(result.isPublished).toBe(false);
      expect(result.count).toBe(1);
      expect(result.affected).toEqual([SPACE_A]);
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: { isPublished: false, publishedAt: null },
        }),
      );
    });

    test("対象が見つからない場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkTogglePublishedSpacesCommand([SPACE_A.id], true);

      expect(result).toEqual({
        count: 0,
        isPublished: true,
        affected: [],
      });
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });
});

describe("bulkDeleteSpacesCommand", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
    mockUpdateMany.mockReset();
    mockReservationFindMany.mockReset();
    mockEventFindMany.mockReset();
    mockDelete.mockReset();
    mockExecuteRaw.mockReset();
    mockTransaction.mockClear();
    mockReservationFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);
    mockExecuteRaw.mockResolvedValue(0);
  });

  describe("正常系", () => {
    test("ids が空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteSpacesCommand([]);

      expect(result).toEqual({
        count: 0,
        skipped: 0,
        skippedIds: [],
        affected: [],
      });
      expect(mockFindMany).not.toHaveBeenCalled();
      expect(mockDelete).not.toHaveBeenCalled();
    });

    test("複数件削除成功で count / skipped / affected を返す", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A, SPACE_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkDeleteSpacesCommand([SPACE_A.id, SPACE_B.id]);

      expect(result).toEqual({
        count: 2,
        skipped: 0,
        skippedIds: [],
        affected: [SPACE_A, SPACE_B],
      });
      expect(mockUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [SPACE_A.id, SPACE_B.id] }, isActive: true },
          data: { isActive: false, isPublished: false, publishedAt: null },
        }),
      );
      expect(mockDelete).not.toHaveBeenCalled();
    });

    test("有効な予約があるスペースはスキップする", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A, SPACE_B]);
      mockReservationFindMany.mockResolvedValueOnce([{ spaceId: SPACE_A.id }]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkDeleteSpacesCommand([SPACE_A.id, SPACE_B.id]);

      expect(result).toEqual({
        count: 1,
        skipped: 1,
        skippedIds: [SPACE_A.id],
        affected: [SPACE_B],
      });
    });

    test("占有中イベントがあるスペースはスキップする", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A, SPACE_B]);
      mockEventFindMany.mockResolvedValueOnce([{ spaceId: SPACE_B.id }]);
      mockUpdateMany.mockResolvedValueOnce({ count: 1 });

      const result = await bulkDeleteSpacesCommand([SPACE_A.id, SPACE_B.id]);

      expect(result).toEqual({
        count: 1,
        skipped: 1,
        skippedIds: [SPACE_B.id],
        affected: [SPACE_A],
      });
    });

    test("対象が見つからない場合は count: 0 を返し delete を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([]);

      const result = await bulkDeleteSpacesCommand([SPACE_A.id]);

      expect(result).toEqual({
        count: 0,
        skipped: 0,
        skippedIds: [],
        affected: [],
      });
      expect(mockDelete).not.toHaveBeenCalled();
    });

    test("全件スキップ時は updateMany を呼ばない", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A]);
      mockReservationFindMany.mockResolvedValueOnce([{ spaceId: SPACE_A.id }]);

      const result = await bulkDeleteSpacesCommand([SPACE_A.id]);

      expect(result).toEqual({
        count: 0,
        skipped: 1,
        skippedIds: [SPACE_A.id],
        affected: [],
      });
      expect(mockUpdateMany).not.toHaveBeenCalled();
    });
  });

  describe("論理削除", () => {
    test("FK 制約回避の物理削除は使わない", async () => {
      mockFindMany.mockResolvedValueOnce([SPACE_A, SPACE_B]);
      mockUpdateMany.mockResolvedValueOnce({ count: 2 });

      const result = await bulkDeleteSpacesCommand([SPACE_A.id, SPACE_B.id]);

      expect(result.affected).toEqual([SPACE_A, SPACE_B]);
      expect(mockDelete).not.toHaveBeenCalled();
    });
  });
});
