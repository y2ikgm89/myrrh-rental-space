import { describe, test, expect, mock, beforeEach } from "bun:test";

const mockLocationFindMany = mock<() => Promise<Record<string, unknown>[]>>(
  () => Promise.resolve([]),
);
const mockLocationCount = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockLocationFindUnique = mock<
  () => Promise<Record<string, unknown> | null>
>(() => Promise.resolve(null));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      findMany: mockLocationFindMany,
      count: mockLocationCount,
      findUnique: mockLocationFindUnique,
    },
  },
}));

const { getLocations, getLocationById } =
  await import("@/shared/domain/locations/queries");

describe("getLocations", () => {
  beforeEach(() => {
    mockLocationFindMany.mockReset();
    mockLocationCount.mockReset();
    mockLocationFindUnique.mockReset();
    mockLocationFindMany.mockResolvedValue([]);
    mockLocationCount.mockResolvedValue(0);
    mockLocationFindUnique.mockResolvedValue(null);
  });

  test("デフォルトでは active な拠点のみ取得する", async () => {
    await getLocations({ page: 1, limit: 10 });

    expect(mockLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true },
      }),
    );
    expect(mockLocationCount).toHaveBeenCalledWith({
      where: { isActive: true },
    });
  });

  test("公開済みフィルタでは isActive と isPublished の両方で絞り込む", async () => {
    await getLocations({ isPublished: true, page: 1, limit: 10 });

    expect(mockLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, isPublished: true },
      }),
    );
    expect(mockLocationCount).toHaveBeenCalledWith({
      where: { isActive: true, isPublished: true },
    });
  });

  test("非公開フィルタでは削除済み拠点を含めない", async () => {
    await getLocations({ isPublished: false, page: 1, limit: 10 });

    expect(mockLocationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { isActive: true, isPublished: false },
      }),
    );
    expect(mockLocationCount).toHaveBeenCalledWith({
      where: { isActive: true, isPublished: false },
    });
  });

  test("詳細取得でも削除済み拠点を対象外にする", async () => {
    await getLocationById("11111111-1111-4111-8111-111111111111");

    expect(mockLocationFindUnique).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          id: "11111111-1111-4111-8111-111111111111",
          isActive: true,
        },
      }),
    );
  });
});
