import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockFindMany = mock<() => Promise<{ pageId: string }[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    userPageAssignment: { findMany: mockFindMany },
  },
}));

const { getAssignedPageIdsForUser } =
  await import("@/shared/domain/user-page-assignments/queries");

describe("getAssignedPageIdsForUser", () => {
  beforeEach(() => {
    mockFindMany.mockReset();
  });

  test("割当なしのユーザーは空配列を返す（権限チェック側で false 化）", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    const result = await getAssignedPageIdsForUser("user-1");

    expect(result).toEqual([]);
  });

  test("割当ありの pageId 配列のみを抽出して返す（other field を leak しない）", async () => {
    mockFindMany.mockResolvedValueOnce([
      { pageId: "page-1" },
      { pageId: "page-2" },
      { pageId: "page-3" },
    ]);

    const result = await getAssignedPageIdsForUser("user-editor");

    expect(result).toEqual(["page-1", "page-2", "page-3"]);
  });

  test("findMany は userId で filter + select: { pageId: true } のみ", async () => {
    mockFindMany.mockResolvedValueOnce([]);

    await getAssignedPageIdsForUser("user-x");

    expect(mockFindMany).toHaveBeenCalledWith({
      where: { userId: "user-x" },
      select: { pageId: true },
    });
  });
});
