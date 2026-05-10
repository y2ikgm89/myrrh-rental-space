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
      mockPostFindUnique,
      mockNewsFindUnique,
      mockPageFindUnique,
      mockSpaceFindUnique,
    ]) {
      m.mockResolvedValue(null);
    }
  });

  test("4 model すべて conflict なしなら null を返す", async () => {
    const result = await findSlugConflict("unused-slug", "post");
    expect(result).toBeNull();
  });

  test("post に conflict があれば post として返す", async () => {
    mockPostFindUnique.mockResolvedValueOnce({ id: "p1" });

    const result = await findSlugConflict("hello-world", "news");

    expect(result).toEqual({ contentType: "post", id: "p1" });
  });

  test("post に conflict がなければ news に fallback", async () => {
    mockNewsFindUnique.mockResolvedValueOnce({ id: "n1" });

    const result = await findSlugConflict("breaking", "post");

    expect(result).toEqual({ contentType: "news", id: "n1" });
  });

  test("優先順位は post → news → page → space（複数 conflict 時は post 優先）", async () => {
    mockPostFindUnique.mockResolvedValueOnce({ id: "p1" });
    mockNewsFindUnique.mockResolvedValueOnce({ id: "n1" });
    mockPageFindUnique.mockResolvedValueOnce({ id: "pg1" });
    mockSpaceFindUnique.mockResolvedValueOnce({ id: "s1" });

    const result = await findSlugConflict("popular-slug", "page");

    expect(result?.contentType).toBe("post");
  });

  test("slug は lower-case 化されてから検索される", async () => {
    // currentId 未指定 → 全 4 model が findUnique 経路（自己除外なし）
    await findSlugConflict("Hello-World", "post");

    expect(mockPostFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ slug: "hello-world" }),
      }),
    );
  });

  test("currentType + currentId 指定時は同 type の自分自身を除外（findFirst + id NOT 経路）", async () => {
    await findSlugConflict("my-slug", "post", "post-current");

    // post は findFirst（自分以外）、他 3 model は findUnique
    expect(mockPostFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({
          slug: "my-slug",
          id: { not: "post-current" },
        }),
      }),
    );
    expect(mockPostFindUnique).not.toHaveBeenCalled();
    expect(mockNewsFindUnique).toHaveBeenCalled();
    expect(mockPageFindUnique).toHaveBeenCalled();
    expect(mockSpaceFindUnique).toHaveBeenCalled();
  });

  test("currentId なしなら findUnique 経路（自己除外なし）", async () => {
    await findSlugConflict("new-slug", "post");

    expect(mockPostFindUnique).toHaveBeenCalled();
    expect(mockPostFindFirst).not.toHaveBeenCalled();
  });
});
