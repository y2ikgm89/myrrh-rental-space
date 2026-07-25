/**
 * 公開ポストクエリ（getPublishedPostsList / getPublishedPost / getPublishedPosts）のテスト
 *
 * 管理画面の「公開日時」欄は未来日時を入力可能（上限バリデーションなし）で、
 * status:PUBLISHED のまま保存できるため、where 句が status のみだと
 * 予約公開のつもりの記事が保存直後から公開サイトに露出してしまう
 * （scheduling-gap regression）。公開 query は必ず `publishedAt <= now` を
 * 併せて渡すことを固定する回帰テスト。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type PostRow = {
  id: string;
  slug: string;
  title: string;
  excerpt: string | null;
  thumbnailUrl: string | null;
  publishedAt: Date | null;
  category: { name: string; slug: string } | null;
};

const mockFindMany = mock<
  (args: { where: Record<string, unknown> }) => Promise<PostRow[]>
>(() => Promise.resolve([]));
const mockFindFirst = mock<
  (args: { where: Record<string, unknown> }) => Promise<PostRow | null>
>(() => Promise.resolve(null));
const mockCount = mock<
  (args: { where: Record<string, unknown> }) => Promise<number>
>(() => Promise.resolve(0));

mock.module("server-only", () => ({}));
mock.module("next/cache", () => ({
  cacheLife: () => {},
  cacheTag: () => {},
  revalidateTag: mock(() => undefined),
  updateTag: mock(() => undefined),
}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      count: mockCount,
    },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  getPublishedPost,
  getPublishedPosts,
  getPublishedPostsList,
} from "@/shared/domain/posts/queries";

const POST_ROW: PostRow = {
  id: "post-1",
  slug: "hello-world",
  title: "Hello",
  excerpt: null,
  thumbnailUrl: null,
  publishedAt: new Date("2026-01-01T00:00:00Z"),
  category: { name: "News", slug: "news" },
};

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindFirst.mockReset();
  mockCount.mockReset();
  mockFindMany.mockResolvedValue([]);
  mockFindFirst.mockResolvedValue(null);
  mockCount.mockResolvedValue(0);
});

describe("getPublishedPostsList", () => {
  test("where 句に status:PUBLISHED と publishedAt<=now を渡す（予約公開の早期露出防止）", async () => {
    mockFindMany.mockResolvedValueOnce([POST_ROW]);
    mockCount.mockResolvedValueOnce(1);
    const before = Date.now();

    await getPublishedPostsList();

    const after = Date.now();
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0];
    if (!call) throw new Error("findMany was not called");
    const [{ where }] = call;
    expect(where["status"]).toBe("PUBLISHED");
    const publishedAtFilter = where["publishedAt"] as { lte: Date };
    expect(publishedAtFilter.lte).toBeInstanceOf(Date);
    expect(publishedAtFilter.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(publishedAtFilter.lte.getTime()).toBeLessThanOrEqual(after);
  });

  test("count クエリにも同じ publishedAt<=now gate を渡す", async () => {
    await getPublishedPostsList();

    expect(mockCount).toHaveBeenCalledTimes(1);
    const call = mockCount.mock.calls[0];
    if (!call) throw new Error("count was not called");
    const [{ where }] = call;
    expect(where["status"]).toBe("PUBLISHED");
    expect(where["publishedAt"]).toEqual(
      expect.objectContaining({ lte: expect.any(Date) }),
    );
  });
});

describe("getPublishedPost", () => {
  test("where 句に slug に加え status:PUBLISHED と publishedAt<=now を渡す", async () => {
    mockFindFirst.mockResolvedValueOnce(POST_ROW);

    await getPublishedPost("hello-world");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "hello-world",
          status: "PUBLISHED",
          publishedAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe("getPublishedPosts", () => {
  test("where 句に status:PUBLISHED と publishedAt<=now を渡す", async () => {
    await getPublishedPosts(5);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          status: "PUBLISHED",
          publishedAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});
