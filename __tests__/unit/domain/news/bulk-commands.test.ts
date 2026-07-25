import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック
// =============================================================================

const mockNewsFindMany = mock<
  (args: {
    where: unknown;
    select: unknown;
  }) => Promise<Array<{ id: string; slug: string; publishedAt: Date | null }>>
>(() => Promise.resolve([]));
const mockNewsUpdateMany = mock<
  (args: { where: unknown; data: unknown }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));
const mockNewsDeleteMany = mock<
  (args: { where: unknown }) => Promise<{ count: number }>
>(() => Promise.resolve({ count: 0 }));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    news: {
      findMany: mockNewsFindMany,
      updateMany: mockNewsUpdateMany,
      deleteMany: mockNewsDeleteMany,
    },
  },
}));

import {
  bulkTogglePublishedNewsCommand,
  bulkDeleteNewsCommand,
} from "@/shared/domain/news/bulk-commands";

// =============================================================================
// Fixtures
// =============================================================================

const NEWS_1 = { id: "news-1", slug: "news-one", publishedAt: null };
const NEWS_2 = { id: "news-2", slug: "news-two", publishedAt: null };
const NEWS_3 = { id: "news-3", slug: "news-three", publishedAt: null };

const EXISTING_PUBLISHED_AT = new Date("2026-01-01T00:00:00.000Z");

// =============================================================================
// bulkTogglePublishedNewsCommand
// =============================================================================

describe("bulkTogglePublishedNewsCommand", () => {
  beforeEach(() => {
    mockNewsFindMany.mockReset();
    mockNewsUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkTogglePublishedNewsCommand([], true);

      expect(result).toEqual({
        count: 0,
        isPublished: true,
        affectedSlugs: [],
      });
      expect(mockNewsFindMany).not.toHaveBeenCalled();
      expect(mockNewsUpdateMany).not.toHaveBeenCalled();
    });

    test("全件未公開(publishedAt: null)を一括公開: 全件に現在時刻を設定する", async () => {
      mockNewsFindMany.mockResolvedValue([
        { ...NEWS_1, publishedAt: null },
        { ...NEWS_2, publishedAt: null },
        { ...NEWS_3, publishedAt: null },
      ]);
      mockNewsUpdateMany.mockResolvedValue({ count: 3 });

      const result = await bulkTogglePublishedNewsCommand(
        [NEWS_1.id, NEWS_2.id, NEWS_3.id],
        true,
      );

      expect(result).toEqual({
        count: 3,
        isPublished: true,
        affectedSlugs: [NEWS_1.slug, NEWS_2.slug, NEWS_3.slug],
      });
      expect(mockNewsUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockNewsUpdateMany).toHaveBeenCalledWith({
        where: {
          id: { in: [NEWS_1.id, NEWS_2.id, NEWS_3.id] },
          deletedAt: null,
        },
        data: {
          isPublished: true,
          publishedAt: expect.any(Date),
        },
      });
    });

    test("公開済み(publishedAt 設定済み)を一括公開しても publishedAt を上書きしない（回帰防止）", async () => {
      mockNewsFindMany.mockResolvedValue([
        { ...NEWS_1, publishedAt: EXISTING_PUBLISHED_AT },
      ]);
      mockNewsUpdateMany.mockResolvedValue({ count: 1 });

      await bulkTogglePublishedNewsCommand([NEWS_1.id], true);

      expect(mockNewsUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockNewsUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [NEWS_1.id] }, deletedAt: null },
        data: { isPublished: true },
      });
    });

    test("公開済みと未公開が混在する一括公開: 公開済みの publishedAt は保持し未公開のみ現在時刻を設定する（回帰防止）", async () => {
      mockNewsFindMany.mockResolvedValue([
        { ...NEWS_1, publishedAt: EXISTING_PUBLISHED_AT },
        { ...NEWS_2, publishedAt: null },
      ]);
      mockNewsUpdateMany
        .mockResolvedValueOnce({ count: 1 }) // 未公開グループ (NEWS_2)
        .mockResolvedValueOnce({ count: 1 }); // 公開済みグループ (NEWS_1)

      const result = await bulkTogglePublishedNewsCommand(
        [NEWS_1.id, NEWS_2.id],
        true,
      );

      expect(result).toEqual({
        count: 2,
        isPublished: true,
        affectedSlugs: [NEWS_1.slug, NEWS_2.slug],
      });
      expect(mockNewsUpdateMany).toHaveBeenCalledTimes(2);
      // 未公開グループ: publishedAt を現在時刻に設定
      expect(mockNewsUpdateMany).toHaveBeenNthCalledWith(1, {
        where: { id: { in: [NEWS_2.id] }, deletedAt: null },
        data: { isPublished: true, publishedAt: expect.any(Date) },
      });
      // 公開済みグループ: publishedAt キー自体を送らず既存値を保持
      expect(mockNewsUpdateMany).toHaveBeenNthCalledWith(2, {
        where: { id: { in: [NEWS_1.id] }, deletedAt: null },
        data: { isPublished: true },
      });
    });

    test("非公開時 isPublished: false + publishedAt: null で updateMany を呼ぶ", async () => {
      mockNewsFindMany.mockResolvedValue([
        { ...NEWS_1, publishedAt: EXISTING_PUBLISHED_AT },
      ]);
      mockNewsUpdateMany.mockResolvedValue({ count: 1 });

      await bulkTogglePublishedNewsCommand([NEWS_1.id], false);

      expect(mockNewsUpdateMany).toHaveBeenCalledTimes(1);
      expect(mockNewsUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [NEWS_1.id] }, deletedAt: null },
        data: {
          isPublished: false,
          publishedAt: null,
        },
      });
    });

    test("findMany の結果が空の場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockNewsFindMany.mockResolvedValue([]);

      const result = await bulkTogglePublishedNewsCommand(["missing-id"], true);

      expect(result).toEqual({
        count: 0,
        isPublished: true,
        affectedSlugs: [],
      });
      expect(mockNewsUpdateMany).not.toHaveBeenCalled();
    });
  });
});

// =============================================================================
// bulkDeleteNewsCommand
// =============================================================================

describe("bulkDeleteNewsCommand", () => {
  beforeEach(() => {
    mockNewsFindMany.mockReset();
    mockNewsUpdateMany.mockReset();
  });

  describe("正常系", () => {
    test("空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteNewsCommand([]);

      expect(result).toEqual({ count: 0, affectedSlugs: [] });
      expect(mockNewsFindMany).not.toHaveBeenCalled();
      expect(mockNewsUpdateMany).not.toHaveBeenCalled();
    });

    test("複数件をソフトデリート: count + affectedSlugs を返す", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1, NEWS_2]);
      mockNewsUpdateMany.mockResolvedValue({ count: 2 });

      const result = await bulkDeleteNewsCommand([NEWS_1.id, NEWS_2.id]);

      expect(result).toEqual({
        count: 2,
        affectedSlugs: [NEWS_1.slug, NEWS_2.slug],
      });
    });

    test("ソフトデリート時に deletedAt を設定して updateMany を呼ぶ", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1, NEWS_2]);
      mockNewsUpdateMany.mockResolvedValue({ count: 2 });

      await bulkDeleteNewsCommand([NEWS_1.id, NEWS_2.id]);

      expect(mockNewsUpdateMany).toHaveBeenCalledWith({
        where: { id: { in: [NEWS_1.id, NEWS_2.id] }, deletedAt: null },
        data: { deletedAt: expect.any(Date) },
      });
    });

    test("findMany の結果が空の場合は count: 0 を返し updateMany を呼ばない", async () => {
      mockNewsFindMany.mockResolvedValue([]);

      const result = await bulkDeleteNewsCommand(["missing-id"]);

      expect(result).toEqual({ count: 0, affectedSlugs: [] });
      expect(mockNewsUpdateMany).not.toHaveBeenCalled();
    });
  });
});
