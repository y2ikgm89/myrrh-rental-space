import { describe, test, expect, mock, beforeEach } from "bun:test";

// ---------------------------------------------------------------------------
// Enums（Prisma import チェーンを避けるために再宣言）
// ---------------------------------------------------------------------------

const EventStatus = {
  DRAFT: "DRAFT",
  PUBLISHED: "PUBLISHED",
  CANCELLED: "CANCELLED",
  COMPLETED: "COMPLETED",
} as const;

// ---------------------------------------------------------------------------
// モック関数（mock.module より前に定義 — TDZ 対策）
// ---------------------------------------------------------------------------

const mockEventFindMany = mock<
  (args: {
    where: unknown;
    select: unknown;
  }) => Promise<{ id: string; slug: string }[]>
>(() => Promise.resolve([]));

const mockEventUpdateMany = mock<
  (args: { where: unknown; data: unknown }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

// ---------------------------------------------------------------------------
// mock.module（import より前）
// ---------------------------------------------------------------------------

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    event: {
      findMany: mockEventFindMany,
      updateMany: mockEventUpdateMany,
    },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  EventStatus,
}));

// ---------------------------------------------------------------------------
// テスト対象のインポート（モック設定後）
// ---------------------------------------------------------------------------

import {
  bulkPublishEventsCommand,
  bulkSoftDeleteEventsCommand,
} from "@/shared/domain/events/bulk-commands";

const VALID_UUID_1 = "11111111-1111-4111-8111-111111111111";
const VALID_UUID_2 = "22222222-2222-4222-8222-222222222222";
const VALID_UUID_3 = "33333333-3333-4333-8333-333333333333";
const ACTOR_UUID = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  mockEventFindMany.mockReset();
  mockEventUpdateMany.mockReset();
  mockEventFindMany.mockImplementation(() => Promise.resolve([]));
  mockEventUpdateMany.mockImplementation(() => Promise.resolve({ count: 0 }));
});

describe("bulkPublishEventsCommand", () => {
  describe("正常系", () => {
    test("空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkPublishEventsCommand([], true);
      expect(result).toEqual({
        count: 0,
        skipped: 0,
        isPublished: true,
        affectedSlugs: [],
        affectedTargets: [],
      });
      expect(mockEventFindMany).not.toHaveBeenCalled();
      expect(mockEventUpdateMany).not.toHaveBeenCalled();
    });

    test("DRAFT のイベントを公開できる（publish: true）", async () => {
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([
          { id: VALID_UUID_1, slug: "event-1" },
          { id: VALID_UUID_2, slug: "event-2" },
        ]),
      );
      mockEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 2 }),
      );

      const result = await bulkPublishEventsCommand(
        [VALID_UUID_1, VALID_UUID_2],
        true,
      );

      expect(result.count).toBe(2);
      expect(result.skipped).toBe(0);
      expect(result.isPublished).toBe(true);
      expect(result.affectedSlugs).toEqual(["event-1", "event-2"]);
      expect(result.affectedTargets).toEqual([
        { id: VALID_UUID_1, slug: "event-1" },
        { id: VALID_UUID_2, slug: "event-2" },
      ]);

      expect(mockEventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            id: { in: [VALID_UUID_1, VALID_UUID_2] },
            deletedAt: null,
            status: { in: [EventStatus.DRAFT] },
          }),
          select: { id: true, slug: true },
        }),
      );
      expect(mockEventUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [VALID_UUID_1, VALID_UUID_2] } },
          data: expect.objectContaining({
            status: EventStatus.PUBLISHED,
          }),
        }),
      );
    });

    test("PUBLISHED のイベントを非公開にできる（publish: false）", async () => {
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([{ id: VALID_UUID_1, slug: "event-1" }]),
      );
      mockEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 1 }),
      );

      const result = await bulkPublishEventsCommand([VALID_UUID_1], false);

      expect(result.count).toBe(1);
      expect(result.isPublished).toBe(false);

      expect(mockEventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            status: { in: [EventStatus.PUBLISHED] },
          }),
        }),
      );
      expect(mockEventUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            status: EventStatus.DRAFT,
            publishedAt: null,
          }),
        }),
      );
    });

    test("publish: true の場合 publishedAt が設定される", async () => {
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([{ id: VALID_UUID_1, slug: "event-1" }]),
      );
      mockEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 1 }),
      );

      await bulkPublishEventsCommand([VALID_UUID_1], true);

      const calls = mockEventUpdateMany.mock.calls;
      expect(calls.length).toBe(1);
      const firstCall = calls[0];
      expect(firstCall).toBeDefined();
      const arg = firstCall?.[0] as { data: { publishedAt: Date | null } };
      expect(arg.data.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe("status filter（遷移制約）", () => {
    test("CANCELLED のイベントは publish 対象外（findMany でフィルタ）", async () => {
      // DRAFT と CANCELLED の混在を想定: findMany が DRAFT のみ返す
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([{ id: VALID_UUID_1, slug: "draft-event" }]),
      );
      mockEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 1 }),
      );

      const result = await bulkPublishEventsCommand(
        [VALID_UUID_1, VALID_UUID_2, VALID_UUID_3],
        true,
      );

      expect(result.count).toBe(1);
      expect(result.skipped).toBe(2);
      expect(result.affectedSlugs).toEqual(["draft-event"]);
    });

    test("対象 0 件の場合は count: 0 / skipped: N で updateMany を呼ばない", async () => {
      mockEventFindMany.mockImplementationOnce(() => Promise.resolve([]));

      const result = await bulkPublishEventsCommand(
        [VALID_UUID_1, VALID_UUID_2],
        true,
      );

      expect(result.count).toBe(0);
      expect(result.skipped).toBe(2);
      expect(result.affectedSlugs).toEqual([]);
      expect(mockEventUpdateMany).not.toHaveBeenCalled();
    });
  });
});

describe("bulkSoftDeleteEventsCommand", () => {
  describe("正常系", () => {
    test("空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkSoftDeleteEventsCommand([], { id: ACTOR_UUID });
      expect(result).toEqual({
        count: 0,
        affectedSlugs: [],
        affectedTargets: [],
      });
      expect(mockEventFindMany).not.toHaveBeenCalled();
      expect(mockEventUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件をソフト削除できる（deletedAt + deletedById セット）", async () => {
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([
          { id: VALID_UUID_1, slug: "event-1" },
          { id: VALID_UUID_2, slug: "event-2" },
        ]),
      );
      mockEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 2 }),
      );

      const result = await bulkSoftDeleteEventsCommand(
        [VALID_UUID_1, VALID_UUID_2],
        { id: ACTOR_UUID },
      );

      expect(result.count).toBe(2);
      expect(result.affectedSlugs).toEqual(["event-1", "event-2"]);
      expect(result.affectedTargets).toEqual([
        { id: VALID_UUID_1, slug: "event-1" },
        { id: VALID_UUID_2, slug: "event-2" },
      ]);

      expect(mockEventFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [VALID_UUID_1, VALID_UUID_2] }, deletedAt: null },
          select: { id: true, slug: true },
        }),
      );
      expect(mockEventUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [VALID_UUID_1, VALID_UUID_2] } },
          data: expect.objectContaining({
            deletedById: ACTOR_UUID,
          }),
        }),
      );
      const calls = mockEventUpdateMany.mock.calls;
      const firstCall = calls[0];
      expect(firstCall).toBeDefined();
      const arg = firstCall?.[0] as {
        data: { deletedAt: Date; deletedById: string };
      };
      expect(arg.data.deletedAt).toBeInstanceOf(Date);
    });

    test("既に削除済みのイベントはフィルタされる", async () => {
      // findMany が deletedAt: null フィルタで 1 件のみ返す（残りは既削除）
      mockEventFindMany.mockImplementationOnce(() =>
        Promise.resolve([{ id: VALID_UUID_1, slug: "event-1" }]),
      );
      mockEventUpdateMany.mockImplementationOnce(() =>
        Promise.resolve({ count: 1 }),
      );

      const result = await bulkSoftDeleteEventsCommand(
        [VALID_UUID_1, VALID_UUID_2, VALID_UUID_3],
        { id: ACTOR_UUID },
      );

      expect(result.count).toBe(1);
      expect(result.affectedSlugs).toEqual(["event-1"]);
    });

    test("対象 0 件の場合は updateMany を呼ばない", async () => {
      mockEventFindMany.mockImplementationOnce(() => Promise.resolve([]));

      const result = await bulkSoftDeleteEventsCommand(
        [VALID_UUID_1, VALID_UUID_2],
        { id: ACTOR_UUID },
      );

      expect(result.count).toBe(0);
      expect(result.affectedSlugs).toEqual([]);
      expect(mockEventUpdateMany).not.toHaveBeenCalled();
    });
  });
});
