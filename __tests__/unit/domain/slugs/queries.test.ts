import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockPostFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockPostFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockNewsFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockNewsFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockPageFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockPageFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockSpaceFindUnique = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);
const mockSpaceFindFirst = mock<() => Promise<{ id: string } | null>>(() =>
  Promise.resolve(null),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    post: { findUnique: mockPostFindUnique, findFirst: mockPostFindFirst },
    news: { findUnique: mockNewsFindUnique, findFirst: mockNewsFindFirst },
    page: { findUnique: mockPageFindUnique, findFirst: mockPageFindFirst },
    space: { findUnique: mockSpaceFindUnique, findFirst: mockSpaceFindFirst },
  },
}));

const { findSlugConflict } = await import("@/shared/domain/slugs/queries");

describe("findSlugConflict", () => {
  beforeEach(() => {
    mockPostFindUnique.mockReset();
    mockPostFindFirst.mockReset();
    mockNewsFindUnique.mockReset();
    mockNewsFindFirst.mockReset();
    mockPageFindUnique.mockReset();
    mockPageFindFirst.mockReset();
    mockSpaceFindUnique.mockReset();
    mockSpaceFindFirst.mockReset();
    for (const m of [
      mockPostFindFirst,
      mockNewsFindUnique,
      mockPageFindUnique,
      mockSpaceFindFirst,
    ]) {
      m.mockResolvedValue(null);
    }
  });

  test("4 model すべて conflict なしなら null を返す", async () => {
    const result = await findSlugConflict("unused-slug", "post");
    expect(result).toBeNull();
  });

  test("post に conflict があれば post として返す", async () => {
    mockPostFindFirst.mockResolvedValueOnce({ id: "p1" });

    const result = await findSlugConflict("hello-world", "news");

    expect(result).toEqual({ contentType: "post", id: "p1" });
  });

  test("post に conflict がなければ news に fallback", async () => {
    mockNewsFindUnique.mockResolvedValueOnce({ id: "n1" });

    const result = await findSlugConflict("breaking", "post");

    expect(result).toEqual({ contentType: "news", id: "n1" });
  });

  test("優先順位は post → news → page → space（複数 conflict 時は post 優先）", async () => {
    mockPostFindFirst.mockResolvedValueOnce({ id: "p1" });
    mockNewsFindUnique.mockResolvedValueOnce({ id: "n1" });
    mockPageFindUnique.mockResolvedValueOnce({ id: "pg1" });
    mockSpaceFindFirst.mockResolvedValueOnce({ id: "s1" });

    const result = await findSlugConflict("popular-slug", "page");

    expect(result?.contentType).toBe("post");
  });

  test("space は findFirst + isActive:true で検索し findUnique は使わない", async () => {
    mockSpaceFindFirst.mockResolvedValueOnce({ id: "s1" });

    const result = await findSlugConflict("studio-a", "news");

    expect(result).toEqual({ contentType: "space", id: "s1" });
    expect(mockSpaceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "studio-a",
          isActive: true,
        }),
      }),
    );
    expect(mockSpaceFindUnique).not.toHaveBeenCalled();
  });

  test("slug は lower-case 化され、post は findFirst + deletedAt:null で検索される", async () => {
    await findSlugConflict("Hello-World", "post");

    expect(mockPostFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "hello-world",
          deletedAt: null,
        }),
      }),
    );
    expect(mockPostFindUnique).not.toHaveBeenCalled();
  });

  test("currentType + currentId 指定時は同 type の自分自身を除外（findFirst + id NOT）", async () => {
    await findSlugConflict("my-slug", "post", "post-current");

    expect(mockPostFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "my-slug",
          deletedAt: null,
          id: { not: "post-current" },
        }),
      }),
    );
    expect(mockPostFindUnique).not.toHaveBeenCalled();
    expect(mockNewsFindUnique).toHaveBeenCalled();
    expect(mockPageFindUnique).toHaveBeenCalled();
    expect(mockSpaceFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "my-slug",
          isActive: true,
        }),
      }),
    );
    expect(mockSpaceFindUnique).not.toHaveBeenCalled();
  });

  test("currentId なしでも post は findFirst（partial unique のため findUnique 不可）", async () => {
    await findSlugConflict("new-slug", "post");

    expect(mockPostFindFirst).toHaveBeenCalled();
    expect(mockPostFindUnique).not.toHaveBeenCalled();
  });
});
