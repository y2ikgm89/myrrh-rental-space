/**
 * buildNewsWhere は管理一覧フィルターの where 句。公開サイトの
 * publicNewsWhere（isPublished + publishedAt<=now）と PUBLISHED を揃える。
 */

import { describe, expect, test, mock } from "bun:test";

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: { news: { count: () => 0, findMany: () => [] } },
}));
mock.module("@/shared/lib/pagination", () => ({
  calcTotalPages: (total: number, limit: number) => Math.ceil(total / limit),
  paginate: (opts: { page?: number; limit?: number }) => {
    const page = opts.page ?? 1;
    const limit = opts.limit ?? 20;
    return { skip: (page - 1) * limit, take: limit, page, limit };
  },
}));

const { buildNewsWhere } = await import("@/shared/domain/news/admin-queries");

describe("buildNewsWhere", () => {
  const now = new Date("2026-07-26T03:00:00.000Z");

  test("status 未指定 → 空 where", () => {
    expect(buildNewsWhere({}, now)).toEqual({});
  });

  test("PUBLISHED → isPublished:true かつ publishedAt<=now", () => {
    expect(buildNewsWhere({ status: "PUBLISHED" }, now)).toEqual({
      isPublished: true,
      publishedAt: { lte: now },
    });
  });

  test("SCHEDULED → isPublished:true かつ publishedAt>now", () => {
    expect(buildNewsWhere({ status: "SCHEDULED" }, now)).toEqual({
      isPublished: true,
      publishedAt: { gt: now },
    });
  });

  test("DRAFT → isPublished:false（publishedAt 条件なし）", () => {
    expect(buildNewsWhere({ status: "DRAFT" }, now)).toEqual({
      isPublished: false,
    });
  });

  test("search は title / contentHtml の OR contains", () => {
    expect(buildNewsWhere({ search: "hello" }, now)).toEqual({
      OR: [
        { title: { contains: "hello", mode: "insensitive" } },
        { contentHtml: { contains: "hello", mode: "insensitive" } },
      ],
    });
  });
});
