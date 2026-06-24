import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSpaceFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockNewsFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPostFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPostCategoryFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPostTagFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPageFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockEventFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockTermsFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: { findMany: mockSpaceFindMany },
    news: { findMany: mockNewsFindMany },
    post: { findMany: mockPostFindMany },
    postCategory: { findMany: mockPostCategoryFindMany },
    postTag: { findMany: mockPostTagFindMany },
    page: { findMany: mockPageFindMany },
    event: { findMany: mockEventFindMany },
    termsDocument: { findMany: mockTermsFindMany },
  },
}));
mock.module("@generated/prisma/enums", () => ({
  PostStatus: { PUBLISHED: "PUBLISHED", DRAFT: "DRAFT" },
  EventStatus: {
    PUBLISHED: "PUBLISHED",
    DRAFT: "DRAFT",
    CANCELLED: "CANCELLED",
  },
}));

const { getSitemapContentData } =
  await import("@/shared/domain/sitemap/queries");

describe("getSitemapContentData", () => {
  beforeEach(() => {
    mockSpaceFindMany.mockReset();
    mockNewsFindMany.mockReset();
    mockPostFindMany.mockReset();
    mockPostCategoryFindMany.mockReset();
    mockPostTagFindMany.mockReset();
    mockPageFindMany.mockReset();
    mockEventFindMany.mockReset();
    mockTermsFindMany.mockReset();
  });

  test("8 collection + systemPageLastModified が空でも空 shape を返す", async () => {
    mockSpaceFindMany.mockResolvedValueOnce([]);
    mockNewsFindMany.mockResolvedValueOnce([]);
    mockPostFindMany.mockResolvedValueOnce([]);
    mockPostCategoryFindMany.mockResolvedValueOnce([]);
    mockPostTagFindMany.mockResolvedValueOnce([]);
    // customPages + systemPageLastModified の 2 回呼ばれる
    mockPageFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValueOnce([]);
    mockTermsFindMany.mockResolvedValueOnce([]);

    const result = await getSitemapContentData();

    expect(result).toEqual({
      spaces: [],
      news: [],
      posts: [],
      postCategories: [],
      postTags: [],
      customPages: [],
      events: [],
      terms: [],
      systemPageLastModified: new Map(),
    });
  });

  test("space は isPublished + isActive の AND filter", async () => {
    await getSitemapContentData();

    expect(mockSpaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isPublished: true, isActive: true },
        orderBy: { updatedAt: "desc" },
      }),
    );
  });

  test("post は status: PUBLISHED filter + category.slug を select に含む", async () => {
    await getSitemapContentData();

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PUBLISHED" },
        select: expect.objectContaining({
          category: { select: { slug: true } },
        }),
      }),
    );
  });

  test("postCategory / postTag は公開記事を持つもののみ（published filter）", async () => {
    await getSitemapContentData();

    expect(mockPostCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { posts: { some: { status: "PUBLISHED" } } },
      }),
    );
    expect(mockPostTagFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { posts: { some: { post: { status: "PUBLISHED" } } } },
      }),
    );
  });

  test("customPages (Page) は isSystemPage: false で system page 除外", async () => {
    await getSitemapContentData();

    expect(mockPageFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          isActive: true,
          isSystemPage: false,
        }),
      }),
    );
  });

  test("event は status: PUBLISHED + deletedAt: null（soft delete 除外）", async () => {
    await getSitemapContentData();

    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { status: "PUBLISHED", deletedAt: null },
      }),
    );
  });

  test("terms は deletedAt: null + isPublished: true", async () => {
    await getSitemapContentData();

    expect(mockTermsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { deletedAt: null, isPublished: true },
      }),
    );
  });

  test("レコード入りデータが正しく shape で返る", async () => {
    const updated = new Date("2025-06-01T00:00:00Z");
    mockSpaceFindMany.mockResolvedValueOnce([
      { slug: "studio-a", updatedAt: updated },
    ]);
    mockPostFindMany.mockResolvedValueOnce([
      {
        slug: "hello",
        updatedAt: updated,
        publishedAt: updated,
        category: { slug: "news" },
      },
    ]);

    const result = await getSitemapContentData();

    expect(result.spaces).toEqual([{ slug: "studio-a", updatedAt: updated }]);
    expect(result.posts[0]?.category?.slug).toBe("news");
  });

  test("systemPageLastModified は Page.updatedAt と Section.updatedAt の max", async () => {
    const pageUpdated = new Date("2026-01-01T00:00:00Z");
    const sectionUpdated = new Date("2026-06-15T00:00:00Z");
    // 1 回目 = customPages (isSystemPage: false) → []
    // 2 回目 = system page (isSystemPage: true) → 2 row
    mockPageFindMany.mockResolvedValueOnce([]).mockResolvedValueOnce([
      {
        slug: "home",
        updatedAt: pageUpdated,
        sections: [{ updatedAt: sectionUpdated }],
      },
      {
        slug: "about",
        updatedAt: pageUpdated,
        sections: [],
      },
    ]);

    const result = await getSitemapContentData();
    expect(result.systemPageLastModified.get("home")).toEqual(sectionUpdated);
    expect(result.systemPageLastModified.get("about")).toEqual(pageUpdated);
  });

  test("1 collection の Promise reject でも他 collection は通常通り返す（fail-soft）", async () => {
    mockSpaceFindMany.mockRejectedValueOnce(new Error("db connection lost"));
    mockNewsFindMany.mockResolvedValueOnce([
      { slug: "n1", updatedAt: new Date("2026-06-01T00:00:00Z") },
    ]);
    mockPageFindMany.mockResolvedValue([]);

    const result = await getSitemapContentData();
    expect(result.spaces).toEqual([]);
    expect(result.news).toEqual([
      { slug: "n1", updatedAt: new Date("2026-06-01T00:00:00Z") },
    ]);
  });
});
