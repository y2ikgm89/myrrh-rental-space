/**
 * 管理お知らせ一覧 (getNewsList) は NewsTable が描画する列だけを select する。
 * 本文・SEO を載せるとページ分の Lexical JSON/HTML が Client props に乗る (N-13)。
 */
import { describe, expect, mock, test } from "bun:test";

const mockFindMany = mock<
  (args: { select: Record<string, unknown> }) => Promise<unknown[]>
>(() => Promise.resolve([]));
const mockCount = mock(() => Promise.resolve(0));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    news: { count: mockCount, findMany: mockFindMany },
  },
}));

const { getNewsList } = await import("@/shared/domain/news/admin-queries");

describe("getNewsList", () => {
  test("findMany の select はテーブル列だけ（本文・SEO を載せない）", async () => {
    await getNewsList();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0];
    if (!call) throw new Error("findMany was not called");
    expect(call[0].select).toEqual({
      id: true,
      title: true,
      isPublished: true,
      publishedAt: true,
      createdAt: true,
    });
  });
});
