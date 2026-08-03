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

const mockIsFeatureEnabled = mock<(module: string) => Promise<boolean>>(() =>
  Promise.resolve(true),
);

mock.module("@/shared/domain/features/check", () => ({
  isFeatureEnabled: mockIsFeatureEnabled,
}));

const { resolveLinkCardsByType } =
  await import("@/shared/domain/link-cards/resolve-queries");

describe("resolveLinkCardsByType", () => {
  beforeEach(() => {
    mockPostFindMany.mockReset();
    mockNewsFindMany.mockReset();
    mockSpaceFindMany.mockReset();
    mockEventFindMany.mockReset();
    mockIsFeatureEnabled.mockReset();
    mockIsFeatureEnabled.mockResolvedValue(true);
    mockPostFindMany.mockResolvedValue([]);
    mockNewsFindMany.mockResolvedValue([]);
    mockSpaceFindMany.mockResolvedValue([]);
    mockEventFindMany.mockResolvedValue([]);
  });

  test("空 id 配列は DB を叩かず空 Map を返す", async () => {
    const map = await resolveLinkCardsByType("post", []);
    expect(map.size).toBe(0);
    expect(mockPostFindMany).not.toHaveBeenCalled();
    expect(mockIsFeatureEnabled).not.toHaveBeenCalled();
  });

  test("対応 Feature Module が OFF なら DB を叩かず空 Map を返す", async () => {
    mockIsFeatureEnabled.mockResolvedValueOnce(false);
    const map = await resolveLinkCardsByType("event", ["e1"]);
    expect(map.size).toBe(0);
    expect(mockIsFeatureEnabled).toHaveBeenCalledWith("events");
    expect(mockEventFindMany).not.toHaveBeenCalled();
  });

  test("post: publicPostsWhere フィルタ + permalink で href を構築", async () => {
    mockPostFindMany.mockResolvedValueOnce([
      {
        id: "p1",
        slug: "a-b",
        title: "記事",
        excerpt: "概要",
        thumbnailUrl: "https://x/t.jpg",
        publishedAt: new Date("2026-01-01T00:00:00.000Z"),
        category: { slug: "news" },
      },
    ]);
    const map = await resolveLinkCardsByType("post", ["p1", "p1"]);
    expect(mockPostFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          id: { in: ["p1"] },
          deletedAt: null,
          status: "PUBLISHED",
          publishedAt: { lte: expect.any(Date) },
        }),
      }),
    );
    const card = map.get("p1");
    expect(card?.title).toBe("記事");
    expect(card?.excerpt).toBe("概要");
    expect(card?.href).toBe("/blog/a-b");
  });

  test("news: publicNewsWhere フィルタ + href は /news/<slug>", async () => {
    mockNewsFindMany.mockResolvedValueOnce([
      { id: "n1", slug: "info", title: "お知らせ" },
    ]);
    const map = await resolveLinkCardsByType("news", ["n1"]);
    expect(mockNewsFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          publishedAt: { lte: expect.any(Date) },
        }),
      }),
    );
    expect(map.get("n1")?.href).toBe("/news/info");
    expect(map.get("n1")?.excerpt).toBeNull();
  });

  test("space: isPublished + isActive、thumbnail は mainImageUrl 優先", async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      {
        id: "s1",
        slug: "studio",
        name: "スタジオ",
        descriptionPlainText: "広い",
        mainImageUrl: "https://x/m.jpg",
        gallery: [{ url: "https://x/1.jpg", alt: "", caption: "" }],
      },
    ]);
    const map = await resolveLinkCardsByType("space", ["s1"]);
    expect(mockSpaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ isPublished: true, isActive: true }),
      }),
    );
    const card = map.get("s1");
    expect(card?.title).toBe("スタジオ");
    expect(card?.thumbnailUrl).toBe("https://x/m.jpg");
    expect(card?.href).toBe("/spaces/studio");
  });

  test("event: PUBLISHED + 未削除フィルタ、href は /events/<slug>", async () => {
    mockEventFindMany.mockResolvedValueOnce([
      { id: "e1", slug: "party", title: "パーティ", thumbnailUrl: null },
    ]);
    const map = await resolveLinkCardsByType("event", ["e1"]);
    // 旧テストは status だけを assert しており、実装が deletedAt を見ていないことを
    // 追認していた。削除済みイベントのカードが本文に残り 404 になる欠陥を通していた。
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          deletedAt: null,
        }),
      }),
    );
    expect(map.get("e1")?.href).toBe("/events/party");
    expect(map.get("e1")?.thumbnailUrl).toBeNull();
  });
});
