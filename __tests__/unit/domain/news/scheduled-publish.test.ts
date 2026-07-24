/**
 * findRecentlyDueScheduledNewsSlugs() のテスト
 *
 * 予約公開（未来日時指定）ニュースの cache 露出精度 cron
 * (`/api/cron/news-scheduled-publish`) が使う検出ロジック。
 * 「直近 lookbackMinutes 分以内に publishedAt を迎えた isPublished:true
 * ニュース」だけを対象にすることを固定する（まだ先の予約公開・とっくに過ぎた
 * 通常公開・非公開記事を誤検出しない）。
 */
import { describe, test, expect, mock, beforeEach } from "bun:test";

type NewsRow = { slug: string };

const mockFindMany = mock<
  (args: { where: Record<string, unknown> }) => Promise<NewsRow[]>
>(() => Promise.resolve([]));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    news: { findMany: mockFindMany },
  },
}));

// eslint-disable-next-line import-x/first -- mock.module must precede imports
import {
  findRecentlyDueScheduledNewsSlugs,
  NEWS_SCHEDULED_PUBLISH_LOOKBACK_MINUTES,
} from "@/shared/domain/news/scheduled-publish";

beforeEach(() => {
  mockFindMany.mockReset();
  mockFindMany.mockResolvedValue([]);
});

describe("findRecentlyDueScheduledNewsSlugs", () => {
  test("where 句に isPublished:true と publishedAt の lte(now)/gt(windowStart) を渡す", async () => {
    const before = Date.now();

    await findRecentlyDueScheduledNewsSlugs(10);

    const after = Date.now();
    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0];
    if (!call) throw new Error("findMany was not called");
    const [{ where }] = call;
    expect(where["isPublished"]).toBe(true);
    const filter = where["publishedAt"] as { lte: Date; gt: Date };
    expect(filter.lte.getTime()).toBeGreaterThanOrEqual(before);
    expect(filter.lte.getTime()).toBeLessThanOrEqual(after);
    // windowStart = now - 10分。誤差込みで妥当な範囲にあることだけ確認する。
    const expectedWindowStart = before - 10 * 60_000;
    expect(filter.gt.getTime()).toBeGreaterThanOrEqual(
      expectedWindowStart - 1000,
    );
    expect(filter.gt.getTime()).toBeLessThanOrEqual(after - 10 * 60_000 + 1000);
  });

  test("lookbackMinutes 省略時は既定の look-back window (20分) を使う", async () => {
    await findRecentlyDueScheduledNewsSlugs();

    const call = mockFindMany.mock.calls[0];
    if (!call) throw new Error("findMany was not called");
    const [{ where }] = call;
    const filter = where["publishedAt"] as { lte: Date; gt: Date };
    const diffMinutes = (filter.lte.getTime() - filter.gt.getTime()) / 60_000;
    expect(diffMinutes).toBeCloseTo(NEWS_SCHEDULED_PUBLISH_LOOKBACK_MINUTES, 1);
  });

  test("該当ニュースの slug 配列を返す", async () => {
    mockFindMany.mockResolvedValueOnce([
      { slug: "announcement-a" },
      { slug: "announcement-b" },
    ]);

    const result = await findRecentlyDueScheduledNewsSlugs();

    expect(result).toEqual(["announcement-a", "announcement-b"]);
  });

  test("該当なしなら空配列を返す", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await findRecentlyDueScheduledNewsSlugs();

    expect(result).toEqual([]);
  });
});
