/**
 * buildLocationLocalBusinessJsonLdData 単体テスト
 *
 * pure function のブランチを網羅:
 * - geo 有無（latitude / longitude が null か否か）
 * - branchOf 有無（options.includeBranchOf）
 * - amenityFeature 変換（amenities JSON → LocationFeatureSpecification[]）
 * - PostalAddress 生成（addressCountry: JP）
 * - currenciesAccepted が常に "JPY"
 * - @id が slug ベース URL
 */

import { describe, expect, test } from "bun:test";

// server-only は setup.ts で global mock 済みだが念のため再 mock
import { mock } from "bun:test";
mock.module("server-only", () => ({}));
// next/cache は server component 境界で必要
mock.module("next/cache", () => ({
  cacheLife: mock(() => {}),
  cacheTag: mock(() => {}),
}));

import { buildLocationLocalBusinessJsonLdData } from "@/public/lib/seo/location-json-ld";
import type { LocationForSeo } from "@/shared/domain/locations/public-queries";

// ─── フィクスチャ ──────────────────────────────────────────────────────────

const BASE_LOCATION: LocationForSeo = {
  id: "11111111-1111-4111-8111-111111111111",
  slug: "honkan",
  name: "本館",
  description: "渋谷の中心に位置するレンタルスペース",
  address: "東京都渋谷区渋谷1-2-3",
  postalCode: "150-0001",
  prefecture: "東京都",
  city: "渋谷区",
  streetAddress: "渋谷1-2-3",
  buildingName: "本館ビル",
  imageUrl: "/images/honkan.jpg",
  businessHours: null,
  specialHolidays: null,
  amenities: null,
  latitude: 35.6595,
  longitude: 139.7004,
  googleBusinessPlaceId: "ChIJxxx",
  googleReviewUrl: null,
  priceRange: "¥1,000〜¥5,000/時間",
  paymentAccepted: "現金, クレジットカード",
  phoneNumber: "03-1234-5678",
  email: "honkan@example.com",
};

// ─── テスト ────────────────────────────────────────────────────────────────

describe("buildLocationLocalBusinessJsonLdData", () => {
  test("@id が slug ベースの URL を含む", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(typeof data["@id"]).toBe("string");
    // slug が @id に含まれることを確認
    expect(data["@id"]).toMatch(/\/access\/honkan#localbusiness$/);
  });

  test("latitude / longitude が両方設定されている場合 geo を含む", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(data.geo).toEqual({
      latitude: 35.6595,
      longitude: 139.7004,
    });
    expect(data.hasMap).toContain("35.6595");
    expect(data.hasMap).toContain("139.7004");
  });

  test("latitude が null の場合 geo を含まない", () => {
    const location: LocationForSeo = {
      ...BASE_LOCATION,
      latitude: null,
    };
    const data = buildLocationLocalBusinessJsonLdData(location, {
      includeBranchOf: false,
    });
    expect(data.geo).toBeUndefined();
    expect(data.hasMap).toBeUndefined();
  });

  test("longitude が null の場合 geo を含まない", () => {
    const location: LocationForSeo = {
      ...BASE_LOCATION,
      longitude: null,
    };
    const data = buildLocationLocalBusinessJsonLdData(location, {
      includeBranchOf: false,
    });
    expect(data.geo).toBeUndefined();
  });

  test("includeBranchOf: true の場合 branchOf を含む", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: true,
    });
    expect(data.branchOf).toBeDefined();
    expect(data.branchOf?.["@id"]).toContain("#organization");
  });

  test("includeBranchOf: false の場合 branchOf を含まない", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(data.branchOf).toBeUndefined();
  });

  test("amenities JSON が正しく amenityFeature に変換される", () => {
    const location: LocationForSeo = {
      ...BASE_LOCATION,
      amenities: { wifi: true, parking: false },
    };
    const data = buildLocationLocalBusinessJsonLdData(location, {
      includeBranchOf: false,
    });
    expect(data.amenityFeature).toBeDefined();
    expect(data.amenityFeature?.length).toBeGreaterThan(0);
    const wifi = data.amenityFeature?.find((f) => f.name === "Wi-Fi");
    expect(wifi).toBeDefined();
    expect(wifi?.["@type"]).toBe("LocationFeatureSpecification");
    expect(wifi?.value).toBe(true);
    const parking = data.amenityFeature?.find((f) => f.name === "駐車場");
    expect(parking).toBeDefined();
    expect(parking?.value).toBe(false);
  });

  test("amenities が null の場合 amenityFeature を含まない", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(data.amenityFeature).toBeUndefined();
  });

  test("PostalAddress に addressCountry: JP が設定される", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(data.address).toBeDefined();
    expect(data.address?.addressCountry).toBe("JP");
    expect(data.address?.postalCode).toBe("150-0001");
    expect(data.address?.addressRegion).toBe("東京都");
    expect(data.address?.addressLocality).toBe("渋谷区");
  });

  test("postalCode と prefecture が両方 null の場合 address を含まない", () => {
    const location: LocationForSeo = {
      ...BASE_LOCATION,
      postalCode: null,
      prefecture: null,
    };
    const data = buildLocationLocalBusinessJsonLdData(location, {
      includeBranchOf: false,
    });
    expect(data.address).toBeUndefined();
  });

  test("currenciesAccepted は常に JPY", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(data.currenciesAccepted).toBe("JPY");
  });

  test("name / url が設定される", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    expect(data.name).toBe("本館");
    expect(data.url).toContain("/access/honkan");
  });

  test("buildingName が streetAddress に連結される", () => {
    const data = buildLocationLocalBusinessJsonLdData(BASE_LOCATION, {
      includeBranchOf: false,
    });
    // streetAddress + buildingName が結合されているかを確認
    expect(data.address?.streetAddress).toContain("渋谷1-2-3");
    expect(data.address?.streetAddress).toContain("本館ビル");
  });
});
