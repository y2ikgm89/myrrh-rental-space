import { describe, test, expect, mock, beforeEach } from "bun:test";

import { FAQ_LOW_RATED_MIN_NOT_HELPFUL } from "@/shared/domain/faq/constants";

// Prisma モック（mock.module より前に定義 — TDZ 回避）
const mockFaqItemFindMany = mock<() => Promise<ReadonlyArray<never>>>(() =>
  Promise.resolve([]),
);
const mockFaqItemCount = mock<() => Promise<number>>(() => Promise.resolve(0));

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    faqItem: {
      findMany: mockFaqItemFindMany,
      count: mockFaqItemCount,
    },
  },
}));

const { getFaqItems } = await import("@/shared/domain/faq/queries");

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";

describe("getFaqItems — quickFilter / sort のクエリ構築", () => {
  beforeEach(() => {
    mockFaqItemFindMany.mockClear();
    mockFaqItemCount.mockClear();
  });

  describe("quickFilter", () => {
    test("low-rated は notHelpfulCount >= しきい値 で絞り込む", async () => {
      await getFaqItems({ categoryId: CATEGORY_ID, quickFilter: "low-rated" });

      expect(mockFaqItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            categoryId: CATEGORY_ID,
            notHelpfulCount: { gte: FAQ_LOW_RATED_MIN_NOT_HELPFUL },
          }),
        }),
      );
    });

    test("stale は updatedAt が古い項目（lt しきい値）を絞り込む", async () => {
      await getFaqItems({ categoryId: CATEGORY_ID, quickFilter: "stale" });

      expect(mockFaqItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { lt: expect.any(Date) },
          }),
        }),
      );
    });

    test("recent は updatedAt が直近（gte しきい値）の項目を絞り込む", async () => {
      await getFaqItems({ categoryId: CATEGORY_ID, quickFilter: "recent" });

      expect(mockFaqItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            updatedAt: { gte: expect.any(Date) },
          }),
        }),
      );
    });
  });

  describe("sortBy", () => {
    test("helpful は helpfulCount + updatedAt の tie-breaker で並べる", async () => {
      await getFaqItems(
        { categoryId: CATEGORY_ID },
        {},
        { sortBy: "helpful", sortOrder: "desc" },
      );

      expect(mockFaqItemFindMany).toHaveBeenCalledWith(
        expect.objectContaining({
          orderBy: [{ helpfulCount: "desc" }, { updatedAt: "desc" }],
        }),
      );
    });
  });
});
