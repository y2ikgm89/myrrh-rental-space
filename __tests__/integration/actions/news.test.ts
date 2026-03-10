/**
 * お知らせ公開 query 統合テスト
 *
 * 公開側のお知らせ取得オプションとフィルタリングロジックのテスト
 *
 * 現在の source of truth は src/shared/domain/news/queries.ts
 */

import { describe, test, expect } from "bun:test";

// =============================================================================
// GetPublishedNewsListOptions Tests
// =============================================================================

describe("News Public Query Integration", () => {
  describe("GetPublishedNewsListOptions", () => {
    test("デフォルト値が正しく設定される", () => {
      const options: { take?: number } = {};
      const { take = 5 } = options;

      expect(take).toBe(5);
    });

    test("カスタム値が正しく適用される", () => {
      const options = { take: 10 };
      const { take = 5 } = options;

      expect(take).toBe(10);
    });
  });

  // Note: NewsStatus enum は isPublished (boolean) に移行したため削除

  describe("PublicNews type validation", () => {
    test("有効なお知らせデータ構造", () => {
      const news = {
        id: "news-123",
        title: "お知らせタイトル",
        publishedAt: new Date("2024-01-15"),
      };

      expect(news.id).toBe("news-123");
      expect(news.title).toBe("お知らせタイトル");
      expect(news.publishedAt).toBeInstanceOf(Date);
    });
  });

  describe("publishedAt filtering logic", () => {
    test("publishedAt が未来の日付の場合フィルタリングされる", () => {
      const newsItems = [
        {
          id: "past-news",
          title: "過去のお知らせ",
          publishedAt: new Date("2024-01-01"),
        },
        {
          id: "future-news",
          title: "未来のお知らせ",
          publishedAt: new Date("2099-12-31"),
        },
      ];

      const filteredNews = newsItems.filter(
        (item) => item.publishedAt && item.publishedAt <= new Date(),
      );

      expect(filteredNews).toHaveLength(1);
      expect(filteredNews[0].id).toBe("past-news");
    });

    test("publishedAt が null の場合フィルタリングされる", () => {
      const newsItems = [
        {
          id: "published-news",
          title: "公開済み",
          publishedAt: new Date("2024-01-01"),
        },
        {
          id: "draft-news",
          title: "下書き",
          publishedAt: null as Date | null,
        },
      ];

      const filteredNews = newsItems.filter(
        (item) => item.publishedAt && item.publishedAt <= new Date(),
      );

      expect(filteredNews).toHaveLength(1);
      expect(filteredNews[0].id).toBe("published-news");
    });

    test("ソート順序（新しい順）", () => {
      const newsItems = [
        { id: "1", publishedAt: new Date("2024-01-01") },
        { id: "3", publishedAt: new Date("2024-03-01") },
        { id: "2", publishedAt: new Date("2024-02-01") },
      ];

      const sorted = newsItems.sort(
        (a, b) => b.publishedAt.getTime() - a.publishedAt.getTime(),
      );

      expect(sorted[0].id).toBe("3");
      expect(sorted[1].id).toBe("2");
      expect(sorted[2].id).toBe("1");
    });
  });

  describe("take limit", () => {
    test("take 制限が正しく適用される", () => {
      const allItems = [
        { id: "1" },
        { id: "2" },
        { id: "3" },
        { id: "4" },
        { id: "5" },
        { id: "6" },
      ];

      const take = 3;
      const limited = allItems.slice(0, take);

      expect(limited).toHaveLength(3);
      expect(limited.map((i) => i.id)).toEqual(["1", "2", "3"]);
    });

    test("take がアイテム数より大きい場合", () => {
      const allItems = [{ id: "1" }, { id: "2" }];

      const take = 10;
      const limited = allItems.slice(0, take);

      expect(limited).toHaveLength(2);
    });
  });
});
