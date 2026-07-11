import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { SidebarWidget } from "@/shared/lib/validations/sidebar";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

const mockPostFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPostCategoryFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPostTagFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: { findMany: mockPostFindMany },
    postCategory: { findMany: mockPostCategoryFindMany },
    postTag: { findMany: mockPostTagFindMany },
  },
}));

mock.module("@generated/prisma/enums", () => ({
  PostStatus: { PUBLISHED: "PUBLISHED", DRAFT: "DRAFT" },
}));

// 公開 URL 生成ヘルパー
mock.module("@/shared/domain/posts/routing", () => ({
  buildPostCanonicalPath: (p: { slug: string }) => `/blog/${p.slug}`,
}));

const { getSidebarData } = await import("@/shared/domain/sidebar/queries");

const RECENT_POST = {
  id: "p1",
  slug: "post-1",
  title: "最新記事",
  publishedAt: new Date("2025-06-01T00:00:00Z"),
  thumbnailUrl: "/img/p1.jpg",
  category: { name: "ニュース", slug: "news" },
};

const POPULAR_POST = {
  id: "p2",
  slug: "post-2",
  title: "人気記事",
  publishedAt: new Date("2025-05-01T00:00:00Z"),
  thumbnailUrl: "/img/p2.jpg",
  category: null,
};

describe("getSidebarData", () => {
  beforeEach(() => {
    mockPostFindMany.mockReset();
    mockPostCategoryFindMany.mockReset();
    mockPostTagFindMany.mockReset();
  });

  test("widget enabled=false の type は対応する fetch を呼ばず空配列を返す", async () => {
    const widgets: SidebarWidget[] = [
      { type: "recent", enabled: false, layout: "compact" },
      { type: "popular", enabled: false, layout: "compact", showRanking: true },
      { type: "categories", enabled: false },
      { type: "tags", enabled: false },
    ];

    const result = await getSidebarData(widgets, 5, 5);

    expect(result.recentPosts).toEqual([]);
    expect(result.popularPosts).toEqual([]);
    expect(result.categories).toEqual([]);
    expect(result.tags).toEqual([]);
    expect(mockPostFindMany).not.toHaveBeenCalled();
    expect(mockPostCategoryFindMany).not.toHaveBeenCalled();
    expect(mockPostTagFindMany).not.toHaveBeenCalled();
  });

  test("recent + popular 両方有効時は post.findMany を 2 回呼ぶ", async () => {
    mockPostFindMany.mockResolvedValueOnce([RECENT_POST]);
    mockPostFindMany.mockResolvedValueOnce([POPULAR_POST]);

    const widgets: SidebarWidget[] = [
      { type: "recent", enabled: true, layout: "compact" },
      { type: "popular", enabled: true, layout: "compact", showRanking: true },
    ];

    const result = await getSidebarData(widgets, 3, 5);

    expect(mockPostFindMany).toHaveBeenCalledTimes(2);
    expect(result.recentPosts).toHaveLength(1);
    expect(result.recentPosts[0]).toMatchObject({
      id: "p1",
      title: "最新記事",
      url: "/blog/post-1",
    });
    expect(result.popularPosts).toHaveLength(1);
    expect(result.popularPosts[0]?.id).toBe("p2");
  });

  test("recent は publishedAt desc / take=recentCount で fetch", async () => {
    mockPostFindMany.mockResolvedValueOnce([]);
    const widgets: SidebarWidget[] = [
      { type: "recent", enabled: true, layout: "compact" },
    ];

    await getSidebarData(widgets, 7, 0);

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { publishedAt: "desc" },
        take: 7,
      }),
    );
  });

  test("popular は publishedAt desc / take=popularCount で fetch", async () => {
    mockPostFindMany.mockResolvedValueOnce([]);
    const widgets: SidebarWidget[] = [
      { type: "popular", enabled: true, layout: "compact", showRanking: true },
    ];

    await getSidebarData(widgets, 0, 4);

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        orderBy: { publishedAt: "desc" },
        take: 4,
      }),
    );
  });

  test("category は postCount を _count.posts から map する", async () => {
    mockPostCategoryFindMany.mockResolvedValueOnce([
      { id: "c1", name: "ニュース", slug: "news", _count: { posts: 5 } },
      { id: "c2", name: "コラム", slug: "column", _count: { posts: 0 } },
    ]);
    const widgets: SidebarWidget[] = [{ type: "categories", enabled: true }];

    const result = await getSidebarData(widgets, 0, 0);

    expect(result.categories).toEqual([
      { id: "c1", name: "ニュース", slug: "news", postCount: 5 },
      { id: "c2", name: "コラム", slug: "column", postCount: 0 },
    ]);
  });

  test("publishedAt が null の post は url 生成後 publishedAt: null で map", async () => {
    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "p3",
        slug: "draft",
        title: "下書き予定",
        publishedAt: null,
        thumbnailUrl: "",
        category: null,
      },
    ]);
    const widgets: SidebarWidget[] = [
      { type: "recent", enabled: true, layout: "compact" },
    ];

    const result = await getSidebarData(widgets, 1, 0);

    expect(result.recentPosts[0]?.publishedAt).toBeNull();
    expect(result.recentPosts[0]?.url).toBe("/blog/draft");
  });
});
