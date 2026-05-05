import { describe, it, expect } from "bun:test";
import type { SpaceWithStats } from "@/admin/lib/validations/space";

describe("SpaceWithStats type includes reviewsEnabled", () => {
  it("reviewsEnabled is required boolean", () => {
    const sample: SpaceWithStats = {
      id: "00000000-0000-0000-0000-000000000001",
      slug: "test",
      name: "Test",
      descriptionJson: { root: { type: "root", children: [] } },
      descriptionHtml: "<p>desc</p>",
      descriptionPlainText: "desc",
      addressDetail: null,
      displayAddress: "東京都渋谷区",
      capacity: 10,
      area: null,
      hourlyPrice: 1000,
      dailyPrice: null,
      mainImageUrl: "https://example.com/image.jpg",
      imageUrls: [],
      facilities: [],
      businessHours: null,
      isPublished: true,
      publishedAt: null,
      isActive: true,
      reviewsEnabled: true,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locationId: "00000000-0000-0000-0000-000000000002",
      categoryId: null,
      category: null,
      discountType: "none" as const,
      discountValue: null,
      durationDiscountOverride: "inherit" as const,
      taxRateType: "standard" as const,
      metaDescription: null,
      metaKeywords: null,
      ogpTitle: null,
      ogpDescription: null,
      ogpImageUrl: null,
      _count: { reservations: 0 },
    };
    expect(sample.reviewsEnabled).toBe(true);
  });
});
