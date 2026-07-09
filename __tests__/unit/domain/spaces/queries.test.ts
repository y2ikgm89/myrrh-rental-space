import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockSpaceFindUnique = mock<() => Promise<Record<string, unknown> | null>>(
  () => Promise.resolve(null),
);
const mockSpaceFindMany = mock<
  (_args?: unknown) => Promise<Record<string, unknown>[]>
>(() => Promise.resolve([]));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findUnique: mockSpaceFindUnique,
      findMany: (args: unknown) => mockSpaceFindMany(args),
    },
  },
}));

const { getSpaceByIdQuery, getSpacesForReviewFilterQuery } =
  await import("@/shared/domain/spaces/queries");

describe("getSpaceByIdQuery", () => {
  beforeEach(() => {
    mockSpaceFindUnique.mockReset();
    mockSpaceFindMany.mockReset();
    mockSpaceFindUnique.mockResolvedValue(null);
    mockSpaceFindMany.mockResolvedValue([]);
  });

  test("詳細取得では削除済みスペースを対象外にする", async () => {
    await getSpaceByIdQuery("11111111-1111-4111-8111-111111111111");

    expect(mockSpaceFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "11111111-1111-4111-8111-111111111111",
          isActive: true,
        },
      }),
    );
  });

  test("レビュー絞り込み用のスペース候補はレビューが存在するスペースから取得する", async () => {
    await getSpacesForReviewFilterQuery();

    expect(mockSpaceFindMany).toHaveBeenCalledWith({
      where: { reviews: { some: {} } },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    });
  });
});
