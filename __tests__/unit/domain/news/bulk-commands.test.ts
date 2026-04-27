import { describe, test, expect, mock, beforeEach } from "bun:test";

// =============================================================================
// Prisma モック
// =============================================================================

const mockNewsFindMany = mock<
  (args: {
    where: unknown;
    select: unknown;
  }) => Promise<Array<{ id: string; slug: string }>>
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

const NEWS_1 = { id: "news-1", slug: "news-one" };
const NEWS_2 = { id: "news-2", slug: "news-two" };
const NEWS_3 = { id: "news-3", slug: "news-three" };

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

    test("複数件を公開: count + isPublished + affectedSlugs を返す", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1, NEWS_2, NEWS_3]);
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
    });

    test("公開時 isPublished: true + publishedAt: Date で updateMany を呼ぶ", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1]);
      mockNewsUpdateMany.mockResolvedValue({ count: 1 });

      await bulkTogglePublishedNewsCommand([NEWS_1.id], true);

      expect(mockNewsUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [NEWS_1.id] } },
          data: expect.objectContaining({
            isPublished: true,
            publishedAt: expect.any(Date),
          }),
        }),
      );
    });

    test("非公開時 isPublished: false + publishedAt: null で updateMany を呼ぶ", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1]);
      mockNewsUpdateMany.mockResolvedValue({ count: 1 });

      await bulkTogglePublishedNewsCommand([NEWS_1.id], false);

      expect(mockNewsUpdateMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: { in: [NEWS_1.id] } },
          data: {
            isPublished: false,
            publishedAt: null,
          },
        }),
      );
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
    mockNewsDeleteMany.mockReset();
  });

  describe("正常系", () => {
    test("空配列の場合は count: 0 を返し DB を呼ばない", async () => {
      const result = await bulkDeleteNewsCommand([]);

      expect(result).toEqual({ count: 0, affectedSlugs: [] });
      expect(mockNewsFindMany).not.toHaveBeenCalled();
      expect(mockNewsDeleteMany).not.toHaveBeenCalled();
    });

    test("複数件を削除: count + affectedSlugs を返す", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1, NEWS_2]);
      mockNewsDeleteMany.mockResolvedValue({ count: 2 });

      const result = await bulkDeleteNewsCommand([NEWS_1.id, NEWS_2.id]);

      expect(result).toEqual({
        count: 2,
        affectedSlugs: [NEWS_1.slug, NEWS_2.slug],
      });
    });

    test("削除時に対象 ids で deleteMany を呼ぶ", async () => {
      mockNewsFindMany.mockResolvedValue([NEWS_1, NEWS_2]);
      mockNewsDeleteMany.mockResolvedValue({ count: 2 });

      await bulkDeleteNewsCommand([NEWS_1.id, NEWS_2.id]);

      expect(mockNewsDeleteMany).toHaveBeenCalledWith({
        where: { id: { in: [NEWS_1.id, NEWS_2.id] } },
      });
    });

    test("findMany の結果が空の場合は count: 0 を返し deleteMany を呼ばない", async () => {
      mockNewsFindMany.mockResolvedValue([]);

      const result = await bulkDeleteNewsCommand(["missing-id"]);

      expect(result).toEqual({ count: 0, affectedSlugs: [] });
      expect(mockNewsDeleteMany).not.toHaveBeenCalled();
    });
  });
});
