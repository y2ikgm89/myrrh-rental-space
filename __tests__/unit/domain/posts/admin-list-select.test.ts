/**
 * 管理投稿一覧 (getPosts) は PostTable が描画する列だけを select する。
 * SEO・メディア・著者・タグを載せない (N-16)。
 */
import { describe, expect, mock, test } from "bun:test";

const mockFindMany = mock<
  (args: { select: Record<string, unknown> }) => Promise<unknown[]>
>(() => Promise.resolve([]));
const mockCount = mock(() => Promise.resolve(0));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: { count: mockCount, findMany: mockFindMany },
  },
}));

const { getPosts } = await import("@/shared/domain/posts/admin-queries");

describe("getPosts", () => {
  test("findMany の select はテーブル列だけ（SEO・メディア・著者・タグを載せない）", async () => {
    await getPosts();

    expect(mockFindMany).toHaveBeenCalledTimes(1);
    const call = mockFindMany.mock.calls[0];
    if (!call) throw new Error("findMany was not called");
    expect(call[0].select).toEqual({
      id: true,
      title: true,
      slug: true,
      publishedAt: true,
      createdAt: true,
      status: true,
      category: {
        select: { name: true },
      },
    });
  });
});
