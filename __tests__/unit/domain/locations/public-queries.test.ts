import { beforeEach, describe, expect, mock, test } from "bun:test";

const cacheLifeMock = mock(() => {});
const cacheTagMock = mock(() => {});
mock.module("next/cache", () => ({
  cacheLife: cacheLifeMock,
  cacheTag: cacheTagMock,
}));

const locationFindMany = mock<(_args?: unknown) => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    location: {
      findMany: (args: unknown) => locationFindMany(args),
    },
  },
}));

interface SafeFetchOpts<T> {
  readonly fetch: () => Promise<T>;
  readonly fallback: T;
}
mock.module("@/shared/lib/errors/server", () => ({
  safeFetch: async <T>(opts: SafeFetchOpts<T>): Promise<T> => {
    try {
      return await opts.fetch();
    } catch {
      return opts.fallback;
    }
  },
  ErrorCategory: { DATABASE: "DATABASE" },
  ErrorSeverity: { LOW: "LOW" },
}));

const {
  getActiveLocations,
  getPublishedLocationsForAccess,
  getPublishedLocationsForSeo,
  getPublishedLocationsWithSpaces,
} = await import("@/shared/domain/locations/public-queries");

const RAW_LOCATION = {
  id: "loc-1",
  slug: "honkan",
  name: "本館",
  description: null,
  address: "東京都渋谷区1-1-1",
  postalCode: null,
  prefecture: null,
  city: null,
  streetAddress: null,
  buildingName: null,
  accessLines: "[]",
  parkingInfo: null,
  amenities: {},
  imageUrl: "https://example.com/a.jpg",
  businessHours: null,
  specialHolidays: null,
  phoneNumber: null,
  email: null,
  latitude: null,
  longitude: null,
  googleReviewUrl: null,
  googleBusinessPlaceId: null,
  priceRange: null,
  paymentAccepted: null,
};

describe("locations/public-queries", () => {
  beforeEach(() => {
    locationFindMany.mockReset();
    locationFindMany.mockResolvedValue([]);
  });

  describe("getActiveLocations", () => {
    test("isPublished/isActive の公開 gate のみで取得する", async () => {
      await getActiveLocations();

      expect(locationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublished: true, isActive: true },
        }),
      );
    });

    test("DB エラー時は空配列にフォールバックする（safeFetch）", async () => {
      locationFindMany.mockImplementationOnce(() => {
        throw new Error("connection lost");
      });

      const result = await getActiveLocations();

      expect(result).toEqual([]);
    });
  });

  describe("getPublishedLocationsForAccess", () => {
    test("slugs 省略時はフィルタなしで公開 gate のみ", async () => {
      await getPublishedLocationsForAccess();

      const call = locationFindMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({ isPublished: true, isActive: true });
      expect(call.where).not.toHaveProperty("slug");
    });

    test("slugs=[] は「明示的に0件」として slug: {in: []} を渡す（全件フォールバックしない）", async () => {
      await getPublishedLocationsForAccess([]);

      const call = locationFindMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({
        isPublished: true,
        isActive: true,
        slug: { in: [] },
      });
    });

    test("slugs 指定時はその slug のみで絞り込む", async () => {
      await getPublishedLocationsForAccess(["honkan", "bekkan"]);

      const call = locationFindMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({
        isPublished: true,
        isActive: true,
        slug: { in: ["honkan", "bekkan"] },
      });
    });

    test("accessLines は Prisma Json 値（パース済み配列）をそのまま検証・整形する", async () => {
      // accessLines は schema.prisma 上 Json 列（`Json @default("[]")`）のため、
      // Prisma は生 JSON 文字列ではなくパース済み値を返す。parseStringArray は
      // unknown を受けて Zod で検証するだけで、JSON.parse は行わない。
      locationFindMany.mockResolvedValueOnce([
        { ...RAW_LOCATION, accessLines: ["徒歩5分", "A1出口"] },
      ]);

      const result = await getPublishedLocationsForAccess();

      expect(result[0]?.accessLines).toEqual(["徒歩5分", "A1出口"]);
    });

    test("accessLines が不正形状（配列でない）のときは空配列にフォールバックする", async () => {
      locationFindMany.mockResolvedValueOnce([
        { ...RAW_LOCATION, accessLines: "not-an-array" },
      ]);

      const result = await getPublishedLocationsForAccess();

      expect(result[0]?.accessLines).toEqual([]);
    });

    test("DB エラー時は空配列にフォールバックする（safeFetch）", async () => {
      locationFindMany.mockImplementationOnce(() => {
        throw new Error("connection lost");
      });

      const result = await getPublishedLocationsForAccess(["honkan"]);

      expect(result).toEqual([]);
    });
  });

  describe("getPublishedLocationsForSeo", () => {
    test("slugs 省略時はフィルタなしで公開 gate のみ", async () => {
      await getPublishedLocationsForSeo();

      const call = locationFindMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({ isPublished: true, isActive: true });
      expect(call.where).not.toHaveProperty("slug");
    });

    test("slugs=[] は明示的に0件として slug: {in: []} を渡す（LocationList mode=selected 未選択時に全件が漏れて出ないことの回帰テスト）", async () => {
      await getPublishedLocationsForSeo([]);

      const call = locationFindMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({
        isPublished: true,
        isActive: true,
        slug: { in: [] },
      });
    });

    test("slugs 指定時はその slug のみで絞り込む", async () => {
      await getPublishedLocationsForSeo(["honkan"]);

      const call = locationFindMany.mock.calls[0]?.[0] as {
        where: Record<string, unknown>;
      };
      expect(call.where).toEqual({
        isPublished: true,
        isActive: true,
        slug: { in: ["honkan"] },
      });
    });

    test("DB エラー時は空配列にフォールバックする（safeFetch）", async () => {
      locationFindMany.mockImplementationOnce(() => {
        throw new Error("connection lost");
      });

      const result = await getPublishedLocationsForSeo();

      expect(result).toEqual([]);
    });
  });

  describe("getPublishedLocationsWithSpaces", () => {
    test("公開 gate のみで取得し、spaces が0件の拠点は除外する", async () => {
      locationFindMany.mockResolvedValueOnce([
        {
          id: "loc-1",
          name: "本館",
          description: null,
          address: "東京都渋谷区1-1-1",
          imageUrl: "https://example.com/a.jpg",
          spaces: [],
        },
        {
          id: "loc-2",
          name: "別館",
          description: null,
          address: "東京都渋谷区2-2-2",
          imageUrl: "https://example.com/b.jpg",
          spaces: [
            {
              id: "space-1",
              name: "会議室A",
              descriptionPlainText: "",
              capacity: 4,
              area: null,
              hourlyPrice: 1000,
              mainImageUrl: "https://example.com/s.jpg",
              gallery: [],
              facilities: [],
              discountType: "none",
              discountValue: null,
              durationDiscountOverride: "inherit",
            },
          ],
        },
      ]);

      const result = await getPublishedLocationsWithSpaces();

      expect(result).toHaveLength(1);
      expect(result[0]?.id).toBe("loc-2");
      expect(locationFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { isPublished: true, isActive: true },
        }),
      );
    });

    test("DB エラー時は空配列にフォールバックする（safeFetch）", async () => {
      locationFindMany.mockImplementationOnce(() => {
        throw new Error("connection lost");
      });

      const result = await getPublishedLocationsWithSpaces();

      expect(result).toEqual([]);
    });
  });
});
