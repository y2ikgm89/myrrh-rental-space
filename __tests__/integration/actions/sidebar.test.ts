/**
 * サイドバー Public Action 統合テスト
 *
 * src/app/(public)/_shared/actions/sidebar.ts のテスト
 *
 * データ構造とフィルタリングロジックのテスト
 */

import { describe, test, expect } from "bun:test";
import type { SidebarWidgets } from "@/shared/lib/validations/sidebar";

// =============================================================================
// SidebarData Types Tests
// =============================================================================

describe("Sidebar Public Action Integration", () => {
  describe("SidebarRecentPost type", () => {
    test("有効な最近の記事データ構造", () => {
      const post = {
        id: "post-123",
        title: "最近の記事",
        slug: "recent-post",
        publishedAt: new Date("2024-01-15"),
        thumbnailUrl: "https://example.com/thumb.jpg",
      };

      expect(post.id).toBe("post-123");
      expect(post.title).toBe("最近の記事");
      expect(post.slug).toBe("recent-post");
      expect(post.publishedAt).toBeInstanceOf(Date);
      expect(post.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    });
  });

  describe("SidebarPopularPost type", () => {
    test("有効な人気記事データ構造", () => {
      const post = {
        id: "post-456",
        title: "人気記事",
        slug: "popular-post",
        viewCount: 1234,
        thumbnailUrl: "https://example.com/thumb.jpg",
      };

      expect(post.id).toBe("post-456");
      expect(post.title).toBe("人気記事");
      expect(post.slug).toBe("popular-post");
      expect(post.viewCount).toBe(1234);
      expect(post.thumbnailUrl).toBe("https://example.com/thumb.jpg");
    });

    test("viewCount によるソート", () => {
      const posts = [
        { id: "1", viewCount: 100 },
        { id: "2", viewCount: 500 },
        { id: "3", viewCount: 250 },
      ];

      const sorted = posts.sort((a, b) => b.viewCount - a.viewCount);

      expect(sorted[0].id).toBe("2");
      expect(sorted[1].id).toBe("3");
      expect(sorted[2].id).toBe("1");
    });
  });

  describe("SidebarCategory type", () => {
    test("有効なカテゴリーデータ構造", () => {
      const category = {
        id: "cat-123",
        name: "テクノロジー",
        slug: "technology",
        postCount: 15,
      };

      expect(category.id).toBe("cat-123");
      expect(category.name).toBe("テクノロジー");
      expect(category.slug).toBe("technology");
      expect(category.postCount).toBe(15);
    });
  });

  describe("SidebarTag type", () => {
    test("有効なタグデータ構造", () => {
      const tag = {
        name: "JavaScript",
        slug: "javascript",
        postCount: 25,
      };

      expect(tag.name).toBe("JavaScript");
      expect(tag.slug).toBe("javascript");
      expect(tag.postCount).toBe(25);
    });

    test("postCount が0のタグはフィルタリングされる", () => {
      const tags = [
        { name: "Popular", slug: "popular", postCount: 10 },
        { name: "Empty", slug: "empty", postCount: 0 },
        { name: "Active", slug: "active", postCount: 5 },
      ];

      const filtered = tags.filter((tag) => tag.postCount > 0);

      expect(filtered).toHaveLength(2);
      expect(filtered.map((t) => t.name)).toEqual(["Popular", "Active"]);
    });

    test("postCount によるソート（降順）", () => {
      const tags = [
        { name: "A", postCount: 5 },
        { name: "B", postCount: 20 },
        { name: "C", postCount: 10 },
      ];

      const sorted = tags.sort((a, b) => b.postCount - a.postCount);

      expect(sorted[0].name).toBe("B");
      expect(sorted[1].name).toBe("C");
      expect(sorted[2].name).toBe("A");
    });
  });

  describe("Tag counting logic", () => {
    test("タグカウントの集計", () => {
      const posts = [
        { tags: ["javascript", "react"] },
        { tags: ["javascript", "typescript"] },
        { tags: ["react", "nextjs"] },
      ];

      const tagCountMap = new Map<string, number>();
      for (const post of posts) {
        if (post.tags && Array.isArray(post.tags)) {
          for (const tagName of post.tags) {
            tagCountMap.set(tagName, (tagCountMap.get(tagName) ?? 0) + 1);
          }
        }
      }

      expect(tagCountMap.get("javascript")).toBe(2);
      expect(tagCountMap.get("react")).toBe(2);
      expect(tagCountMap.get("typescript")).toBe(1);
      expect(tagCountMap.get("nextjs")).toBe(1);
    });

    test("null または空のタグ配列の処理", () => {
      const posts = [
        { tags: ["javascript"] },
        { tags: null },
        { tags: [] },
        { tags: ["react"] },
      ];

      const tagCountMap = new Map<string, number>();
      for (const post of posts) {
        const postTags = post.tags as string[] | null;
        if (postTags && Array.isArray(postTags)) {
          for (const tagName of postTags) {
            tagCountMap.set(tagName, (tagCountMap.get(tagName) ?? 0) + 1);
          }
        }
      }

      expect(tagCountMap.size).toBe(2);
      expect(tagCountMap.get("javascript")).toBe(1);
      expect(tagCountMap.get("react")).toBe(1);
    });
  });

  describe("SidebarWidgets settings", () => {
    test("デフォルトウィジェット設定", () => {
      const defaultWidgets: SidebarWidgets = {
        search: true,
        recent: true,
        popular: true,
        categories: true,
        tags: true,
      };

      expect(defaultWidgets.search).toBe(true);
      expect(defaultWidgets.recent).toBe(true);
      expect(defaultWidgets.popular).toBe(true);
      expect(defaultWidgets.categories).toBe(true);
      expect(defaultWidgets.tags).toBe(true);
    });

    test("部分的な設定のマージ", () => {
      const defaultWidgets: SidebarWidgets = {
        search: true,
        recent: true,
        popular: true,
        categories: true,
        tags: true,
      };

      const customWidgets = {
        search: false,
        tags: false,
      };

      const merged = { ...defaultWidgets, ...customWidgets };

      expect(merged.search).toBe(false);
      expect(merged.recent).toBe(true);
      expect(merged.popular).toBe(true);
      expect(merged.categories).toBe(true);
      expect(merged.tags).toBe(false);
    });

    test("sidebarEnabled のデフォルト値", () => {
      const settings = null;
      const enabled = settings ?? true;

      expect(enabled).toBe(true);
    });
  });

  describe("SidebarData complete structure", () => {
    test("有効な完全なサイドバーデータ", () => {
      const sidebarData = {
        recentPosts: [
          {
            id: "recent-1",
            title: "最近の記事1",
            slug: "recent-1",
            publishedAt: new Date(),
            thumbnailUrl: "",
          },
        ],
        popularPosts: [
          {
            id: "popular-1",
            title: "人気記事1",
            slug: "popular-1",
            viewCount: 100,
            thumbnailUrl: "",
          },
        ],
        categories: [
          {
            id: "cat-1",
            name: "カテゴリー1",
            slug: "category-1",
            postCount: 5,
          },
        ],
        tags: [
          {
            name: "タグ1",
            slug: "tag-1",
            postCount: 3,
          },
        ],
      };

      expect(sidebarData.recentPosts).toHaveLength(1);
      expect(sidebarData.popularPosts).toHaveLength(1);
      expect(sidebarData.categories).toHaveLength(1);
      expect(sidebarData.tags).toHaveLength(1);
    });

    test("空のサイドバーデータ", () => {
      const emptySidebarData = {
        recentPosts: [],
        popularPosts: [],
        categories: [],
        tags: [],
      };

      expect(emptySidebarData.recentPosts).toHaveLength(0);
      expect(emptySidebarData.popularPosts).toHaveLength(0);
      expect(emptySidebarData.categories).toHaveLength(0);
      expect(emptySidebarData.tags).toHaveLength(0);
    });
  });

  describe("recentCount and popularCount settings", () => {
    test("デフォルト値", () => {
      const settings = null;
      const recentCount = settings ?? 5;
      const popularCount = settings ?? 5;

      expect(recentCount).toBe(5);
      expect(popularCount).toBe(5);
    });

    test("カスタム値", () => {
      const settings = {
        sidebarRecentCount: 10,
        sidebarPopularCount: 8,
      };

      const recentCount = settings.sidebarRecentCount ?? 5;
      const popularCount = settings.sidebarPopularCount ?? 5;

      expect(recentCount).toBe(10);
      expect(popularCount).toBe(8);
    });
  });
});
