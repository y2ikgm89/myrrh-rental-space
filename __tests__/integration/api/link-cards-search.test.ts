import { beforeEach, describe, expect, mock, test } from "bun:test";

mock.module("server-only", () => ({}));

const mockPostFindMany = mock<() => Promise<Record<string, unknown>[]>>(() =>
  Promise.resolve([]),
);
const mockNewsFindMany = mock<() => Promise<Record<string, unknown>[]>>(() =>
  Promise.resolve([]),
);
const mockSpaceFindMany = mock<() => Promise<Record<string, unknown>[]>>(() =>
  Promise.resolve([]),
);
const mockEventFindMany = mock<() => Promise<Record<string, unknown>[]>>(() =>
  Promise.resolve([]),
);

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: { findMany: mockPostFindMany },
    news: { findMany: mockNewsFindMany },
    space: { findMany: mockSpaceFindMany },
    event: { findMany: mockEventFindMany },
  },
}));

const { searchLinkCardCandidates } =
  await import("@/shared/domain/link-cards/search-queries");

describe("searchLinkCardCandidates", () => {
  beforeEach(() => {
    mockPostFindMany.mockReset();
    mockNewsFindMany.mockReset();
    mockSpaceFindMany.mockReset();
    mockEventFindMany.mockReset();
    mockPostFindMany.mockResolvedValue([]);
    mockNewsFindMany.mockResolvedValue([]);
    mockSpaceFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);
  });

  test("post: PUBLISHED フィルタ + 正規化マッピング", async () => {
    mockPostFindMany.mockResolvedValueOnce([
      { id: "p1", title: "記事A", thumbnailUrl: "https://x/a.jpg" },
      { id: "p2", title: "記事B", thumbnailUrl: null },
    ]);

    const results = await searchLinkCardCandidates({
      contentType: "post",
      query: "記事",
    });

    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          title: { contains: "記事", mode: "insensitive" },
        }),
      }),
    );
    expect(results).toEqual([
      {
        contentType: "post",
        contentId: "p1",
        title: "記事A",
        thumbnailUrl: "https://x/a.jpg",
      },
      {
        contentType: "post",
        contentId: "p2",
        title: "記事B",
        thumbnailUrl: null,
      },
    ]);
  });

  test("news: isPublished フィルタ + thumbnail は常に null", async () => {
    mockNewsFindMany.mockResolvedValueOnce([{ id: "n1", title: "お知らせ" }]);

    const results = await searchLinkCardCandidates({
      contentType: "news",
      query: "",
    });

    expect(mockNewsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublished: true }),
      }),
    );
    expect(results).toEqual([
      {
        contentType: "news",
        contentId: "n1",
        title: "お知らせ",
        thumbnailUrl: null,
      },
    ]);
  });

  test("space: isPublished + isActive、thumbnail は mainImageUrl 優先", async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      {
        id: "s1",
        name: "スペースA",
        mainImageUrl: "https://x/main.jpg",
        gallery: [{ url: "https://x/1.jpg", alt: "", caption: "" }],
      },
      {
        id: "s2",
        name: "スペースB",
        mainImageUrl: null,
        gallery: [{ url: "https://x/2.jpg", alt: "", caption: "" }],
      },
    ]);

    const results = await searchLinkCardCandidates({
      contentType: "space",
      query: "",
    });

    expect(mockSpaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublished: true, isActive: true }),
      }),
    );
    expect(results[0]?.thumbnailUrl).toBe("https://x/main.jpg");
    expect(results[1]?.thumbnailUrl).toBe("https://x/2.jpg");
    expect(results[0]?.title).toBe("スペースA");
  });

  test("event: PUBLISHED フィルタ + 正規化マッピング", async () => {
    mockEventFindMany.mockResolvedValueOnce([
      { id: "e1", title: "イベント", thumbnailUrl: "https://x/e.jpg" },
    ]);

    const results = await searchLinkCardCandidates({
      contentType: "event",
      query: "",
    });

    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ status: "PUBLISHED" }),
      }),
    );
    expect(results).toEqual([
      {
        contentType: "event",
        contentId: "e1",
        title: "イベント",
        thumbnailUrl: "https://x/e.jpg",
      },
    ]);
  });

  test("limit は上限 30 にクランプされる", async () => {
    await searchLinkCardCandidates({
      contentType: "post",
      query: "",
      limit: 999,
    });
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ take: 30 }),
    );
  });

  test("空クエリ（空白のみ）では title フィルタを付けず status のみで検索する", async () => {
    await searchLinkCardCandidates({ contentType: "post", query: "   " });
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { status: "PUBLISHED" } }),
    );
  });
});
