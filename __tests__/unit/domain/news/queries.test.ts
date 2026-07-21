/**
 * 公開ニュースクエリ（getPublishedNewsList / getPublishedNewsItem / getPublishedNews）のテスト
 *
 * 管理画面の「公開日時」欄は未来日時を入力可能（上限バリデーションなし）で、
 * isPublished:true のまま保存できるため、where 句が isPublished のみだと
 * 予約公開のつもりの記事が保存直後から公開サイトに露出してしまう
 * （scheduling-gap regression）。公開 query は必ず `publishedAt <= now` を
 * 併せて渡すことを固定する回帰テスト。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type NewsRow = {
  id: string;
  slug: string;
  title: string;
  publishedAt: Date | null;
};

const mockFindMany = mock<
  (args: { where: Record<string, unknown> }) => Promise<NewsRow[]>
>(() => Promise.resolve([]));
const mockFindFirst = mock<
  (args: { where: Record<string, unknown> }) => Promise<NewsRow | null>
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
    news: {
      findMany: mockFindMany,
      findFirst: mockFindFirst,
      count: mockCount,
    },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  getPublishedNews,
  getPublishedNewsItem,
  getPublishedNewsList,
} from "@/shared/domain/news/queries";

const NEWS_ROW: NewsRow = {
  id: "news-1",
  slug: "announcement",
  title: "お知らせ",
  publishedAt: new Date("2026-01-01T00:00:00Z"),
};

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindFirst.mockReset();
  mockCount.mockReset();
  mockFindMany.mockResolvedValue([]);
  mockFindFirst.mockResolvedValue(null);
  mockCount.mockResolvedValue(0);
});

describe("getPublishedNewsList", () => {
  test("where 句に isPublished:true と publishedAt<=now を渡す（予約公開の早期露出防止）", async () => {
    mockFindMany.mockResolvedValueOnce([NEWS_ROW]);
    mockCount.mockResolvedValueOnce(1);
    const before = Date.now();

    await getPublishedNewsList();

    const after = Date.now();
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0];
    if (!call) throw new Error("findMany was not called");
    const [{ where }] = call;
    expect(where["isPublished"]).toBe(true);
    const publishedAtFilter = where["publishedAt"] as { lte: Date };
    expect(publishedAtFilter.lte).toBeInstanceOf(Date);
    expect(publishedAtFilter.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(publishedAtFilter.lte.getTime()).toBeLessThanOrEqual(after);
  });

  test("count クエリにも同じ publishedAt<=now gate を渡す", async () => {
    await getPublishedNewsList();

    expect(mockCount).toHaveBeenCalledTimes(1);
    const call = mockCount.mock.calls[0];
    if (!call) throw new Error("count was not called");
    const [{ where }] = call;
    expect(where["isPublished"]).toBe(true);
    expect(where["publishedAt"]).toEqual(
      expect.objectContaining({ lte: expect.any(Date) }),
    );
  });
});

describe("getPublishedNewsItem", () => {
  test("where 句に slug に加え isPublished:true と publishedAt<=now を渡す", async () => {
    mockFindFirst.mockResolvedValueOnce(NEWS_ROW);

    await getPublishedNewsItem("announcement");

    expect(mockFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "announcement",
          isPublished: true,
          publishedAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});

describe("getPublishedNews", () => {
  test("where 句に isPublished:true と publishedAt<=now を渡す", async () => {
    await getPublishedNews(5);

    expect(mockFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          isPublished: true,
          publishedAt: expect.objectContaining({ lte: expect.any(Date) }),
        }),
      }),
    );
  });
});
