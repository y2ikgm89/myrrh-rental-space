import { describe, expect, mock, test } from "bun:test";

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    space: {
      findMany: mock(async () => [
        { id: "s1", name: "渋谷店", slug: "shibuya" },
      ]),
    },
    customer: {
      findMany: mock(async () => [
        {
          id: "c1",
          lastName: "山田",
          firstName: "太郎",
          email: "y@example.com",
        },
      ]),
    },
    reservation: {
      findMany: mock(async () => [
        {
          id: "r1",
          startTime: new Date("2026-05-01"),
          customer: { lastName: "山田" },
          space: { name: "渋谷" },
        },
      ]),
    },
    post: {
      findMany: mock(async () => [{ id: "p1", title: "投稿", slug: "post" }]),
    },
    news: {
      findMany: mock(async () => [
        { id: "n1", title: "ニュース", slug: "news" },
      ]),
    },
    page: {
      findMany: mock(async () => [
        { id: "pg1", title: "ページ", slug: "page" },
      ]),
    },
    event: {
      findMany: mock(async () => [
        {
          id: "e1",
          title: "イベント",
          slug: "event",
          startTime: new Date("2026-05-01"),
        },
      ]),
    },
    inquiry: {
      findMany: mock(async () => [
        { id: "i1", name: "問合せ", subject: "件名" },
      ]),
    },
    faqItem: {
      findMany: mock(async () => [
        { id: "f1", question: "質問", categoryId: "cat1" },
      ]),
    },
    coupon: {
      findMany: mock(async () => [{ id: "co1", code: "C10", name: "10% off" }]),
    },
    location: {
      findMany: mock(async () => [{ id: "l1", name: "本館" }]),
    },
  },
}));

import {
  searchByResource,
  SEARCHABLE_RESOURCES,
} from "@/shared/domain/admin-search/queries";

describe("searchByResource", () => {
  test("11 resource すべてが SEARCHABLE_RESOURCES に含まれる", () => {
    expect(SEARCHABLE_RESOURCES.length).toBe(11);
  });

  for (const resource of [
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
  ] as const) {
    test(`${resource} 検索が SearchResultItem を返す`, async () => {
      const group = await searchByResource(resource, "test");
      expect(group.resource).toBe(resource);
      expect(group.items.length).toBeGreaterThan(0);
      expect(group.items[0]?.href).toMatch(/^\/admin\//);
    });
  }
});
