import { describe, test, expect, mock, beforeEach } from "bun:test";
import type { Resource } from "@/shared/lib/admin-resources";

// =============================================================================
// Mocks (must precede module under test import — TDZ)
// =============================================================================

const mockSpaceFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockCustomerFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockReservationFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPostFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockEventFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockInquiryFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockFaqItemFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockCouponFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockLocationFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockNewsFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);
const mockPageFindMany = mock<() => Promise<unknown[]>>(() =>
  Promise.resolve([]),
);

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: { findMany: mockSpaceFindMany },
    customer: { findMany: mockCustomerFindMany },
    reservation: { findMany: mockReservationFindMany },
    post: { findMany: mockPostFindMany },
    news: { findMany: mockNewsFindMany },
    page: { findMany: mockPageFindMany },
    event: { findMany: mockEventFindMany },
    inquiry: { findMany: mockInquiryFindMany },
    faqItem: { findMany: mockFaqItemFindMany },
    coupon: { findMany: mockCouponFindMany },
    location: { findMany: mockLocationFindMany },
  },
}));

const { searchByResource, SEARCHABLE_RESOURCES } =
  await import("@/shared/domain/admin-search/queries");

describe("SEARCHABLE_RESOURCES", () => {
  test("11 種類のリソースをカバーする", () => {
    expect(SEARCHABLE_RESOURCES).toHaveLength(11);
  });

  test("主要 resource が含まれる（space / customer / reservation / post / news / page / event / inquiry / faq / coupon / location）", () => {
    const expected: Resource[] = [
      "space",
      "customer",
      "reservation",
      "post",
      "news",
      "page",
      "event",
      "inquiry",
      "faq",
      "coupon",
      "location",
    ];
    for (const r of expected) {
      expect(SEARCHABLE_RESOURCES).toContain(r);
    }
  });
});

describe("searchByResource", () => {
  beforeEach(() => {
    mockSpaceFindMany.mockReset();
    mockCustomerFindMany.mockReset();
    mockReservationFindMany.mockReset();
    mockPostFindMany.mockReset();
    mockEventFindMany.mockReset();
    mockInquiryFindMany.mockReset();
    mockFaqItemFindMany.mockReset();
    mockCouponFindMany.mockReset();
    mockLocationFindMany.mockReset();
    mockNewsFindMany.mockReset();
    mockPageFindMany.mockReset();
  });

  test("space: name + slug の OR 検索 + take=5 で SearchResultItem に map", async () => {
    mockSpaceFindMany.mockResolvedValueOnce([
      { id: "s1", name: "Studio A", slug: "studio-a" },
      { id: "s2", name: "Conference Hall", slug: "conf" },
    ]);

    const result = await searchByResource("space", "studio");

    expect(result.resource).toBe("space");
    expect(result.items).toHaveLength(2);
    expect(result.items[0]).toMatchObject({
      id: "s1",
      resource: "space",
      label: "Studio A",
      description: "/studio-a",
      href: "/admin/spaces/s1",
    });
    expect(mockSpaceFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        take: 5,
        where: expect.objectContaining({
          OR: [
            { name: { contains: "studio", mode: "insensitive" } },
            { slug: { contains: "studio", mode: "insensitive" } },
          ],
        }),
      }),
    );
  });

  test("customer: lastName + firstName を結合した label を生成する", async () => {
    mockCustomerFindMany.mockResolvedValueOnce([
      {
        id: "c1",
        lastName: "山田",
        firstName: "太郎",
        email: "yamada@example.com",
      },
    ]);

    const result = await searchByResource("customer", "山田");

    expect(result.items[0]).toMatchObject({
      id: "c1",
      resource: "customer",
      label: "山田 太郎",
      description: "yamada@example.com",
      href: "/admin/customers/c1",
    });
  });

  test("reservation: deletedAt: null で soft delete を除外", async () => {
    mockReservationFindMany.mockResolvedValueOnce([]);

    await searchByResource("reservation", "test");

    expect(mockReservationFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  test("event: deletedAt: null で soft delete を除外 + startTime を YYYY-MM-DD で description 化", async () => {
    mockEventFindMany.mockResolvedValueOnce([
      {
        id: "e1",
        title: "Test Event",
        slug: "test",
        startTime: new Date("2025-06-15T10:00:00Z"),
      },
    ]);

    const result = await searchByResource("event", "test");

    expect(result.items[0]).toMatchObject({
      id: "e1",
      resource: "event",
      label: "Test Event",
      description: "2025-06-15",
    });
    expect(mockEventFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  test("faq: deletedAt: null で soft delete 除外 + categoryId ベースの href", async () => {
    mockFaqItemFindMany.mockResolvedValueOnce([
      { id: "f1", question: "How to cancel?", categoryId: "cat-1" },
    ]);

    const result = await searchByResource("faq", "cancel");

    expect(result.items[0]).toMatchObject({
      id: "f1",
      resource: "faq",
      label: "How to cancel?",
      href: "/admin/faq/cat-1",
    });
    expect(mockFaqItemFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ deletedAt: null }),
      }),
    );
  });

  test("coupon: code + name を `{code} ({name})` 形式で label 化", async () => {
    mockCouponFindMany.mockResolvedValueOnce([
      { id: "cp1", code: "SAVE10", name: "10% OFF" },
    ]);

    const result = await searchByResource("coupon", "save");

    expect(result.items[0]).toMatchObject({
      id: "cp1",
      resource: "coupon",
      label: "SAVE10 (10% OFF)",
      href: "/admin/coupons/cp1",
    });
  });

  test("location: spaces tab + edit query 付きの href を生成", async () => {
    mockLocationFindMany.mockResolvedValueOnce([
      { id: "loc1", name: "Tokyo Office" },
    ]);

    const result = await searchByResource("location", "tokyo");

    expect(result.items[0]).toMatchObject({
      id: "loc1",
      resource: "location",
      label: "Tokyo Office",
      href: "/admin/spaces?tab=locations&edit=loc1",
    });
  });

  test("page: slug ベースの href を生成（id ではない）", async () => {
    mockPageFindMany.mockResolvedValueOnce([
      { id: "p-uuid", title: "About Us", slug: "about" },
    ]);

    const result = await searchByResource("page", "about");

    expect(result.items[0]).toMatchObject({
      id: "p-uuid",
      resource: "page",
      label: "About Us",
      href: "/admin/pages/about",
    });
  });

  test("未対応 resource は items: [] を返す（404 / type 衝突から防御）", async () => {
    // SEARCH_BY_RESOURCE の handler に存在しない resource
    const result = await searchByResource("settings" as Resource, "test");

    expect(result).toEqual({ resource: "settings", items: [] });
    // どの handler も呼ばれない
    expect(mockSpaceFindMany).not.toHaveBeenCalled();
    expect(mockCustomerFindMany).not.toHaveBeenCalled();
  });

  test("結果 0 件は items: [] で返る（DB レコード不在）", async () => {
    mockSpaceFindMany.mockResolvedValueOnce([]);

    const result = await searchByResource("space", "nonexistent");

    expect(result).toEqual({ resource: "space", items: [] });
  });
});
