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

  // 編集フォームは読んだ設備をそのまま hidden input で書き戻すため、
  // 「読めなかった」を空配列に潰すと無関係な項目の保存で設備が消える。
  describe("facilitiesUnreadable", () => {
    function spaceRow(facilities: unknown): Record<string, unknown> {
      return {
        id: "11111111-1111-4111-8111-111111111111",
        slug: "space",
        name: "Space",
        descriptionJson: { root: { type: "root", children: [] } },
        descriptionHtml: "",
        descriptionPlainText: "",
        addressDetail: null,
        capacity: 10,
        area: null,
        hourlyPrice: 1000,
        mainImageUrl: "https://example.com/i.jpg",
        gallery: [],
        facilities,
        businessHours: null,
        isPublished: true,
        publishedAt: null,
        isActive: true,
        reviewsEnabled: false,
        createdAt: new Date(0),
        updatedAt: new Date(0),
        locationId: "22222222-2222-4222-8222-222222222222",
        categoryId: null,
        smartLockDeviceId: null,
        location: { address: "東京都渋谷区" },
        category: null,
        discountType: null,
        discountValue: null,
        durationDiscountOverride: null,
        taxRateType: "standard",
        metaDescription: null,
        metaKeywords: null,
        ogpTitle: null,
        ogpDescription: null,
        ogpImageUrl: null,
        _count: { reservations: 0 },
      };
    }

    test("読めた設備がある場合は false", async () => {
      mockSpaceFindUnique.mockResolvedValue(
        spaceRow([{ name: "Wi-Fi", iconName: "IconWifi" }]),
      );

      const space = await getSpaceByIdQuery(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(space?.facilities).toEqual([
        { name: "Wi-Fi", iconName: "IconWifi" },
      ]);
      expect(space?.facilitiesUnreadable).toBe(false);
    });

    test("設備が未設定（空配列）でも読み取り失敗にはしない", async () => {
      mockSpaceFindUnique.mockResolvedValue(spaceRow([]));

      const space = await getSpaceByIdQuery(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(space?.facilities).toEqual([]);
      expect(space?.facilitiesUnreadable).toBe(false);
    });

    test("1 件も読めなかった場合は true（空配列と見分けが付く）", async () => {
      mockSpaceFindUnique.mockResolvedValue(spaceRow([{ nope: 1 }]));

      const space = await getSpaceByIdQuery(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(space?.facilities).toEqual([]);
      expect(space?.facilitiesUnreadable).toBe(true);
    });

    test("配列でない値が保存されていた場合も true", async () => {
      mockSpaceFindUnique.mockResolvedValue(spaceRow("Wi-Fi,机"));

      const space = await getSpaceByIdQuery(
        "11111111-1111-4111-8111-111111111111",
      );

      expect(space?.facilities).toEqual([]);
      expect(space?.facilitiesUnreadable).toBe(true);
    });
  });
});
