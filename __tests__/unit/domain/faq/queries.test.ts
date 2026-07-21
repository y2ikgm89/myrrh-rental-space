import { describe, test, expect, mock, beforeEach } from "bun:test";

import { FAQ_LOW_RATED_MIN_NOT_HELPFUL } from "@/shared/domain/faq/constants";

// Prisma モック（mock.module より前に定義 — TDZ 回避）
const mockFaqItemFindMany = mock<() => Promise<ReadonlyArray<never>>>(() =>
  Promise.resolve([]),
);
const mockFaqItemCount = mock<() => Promise<number>>(() => Promise.resolve(0));
const mockFaqItemGroupBy = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));
const mockFaqCategoryFindMany = mock<
  () => Promise<ReadonlyArray<Record<string, unknown>>>
>(() => Promise.resolve([]));
const mockFaqCategoryFindFirst = mock<() => Promise<unknown>>(() =>
  Promise.resolve(null),
);

mock.module("server-only", () => ({}));
mock.module("@/shared/db/prisma", () => ({
  prisma: {
    faqItem: {
      findMany: mockFaqItemFindMany,
      count: mockFaqItemCount,
      groupBy: mockFaqItemGroupBy,
    },
    faqCategory: {
      findMany: mockFaqCategoryFindMany,
      findFirst: mockFaqCategoryFindFirst,
    },
  },
}));

const {
  getFaqItems,
  getFaqHealthSummary,
  getFaqCategories,
  getFaqCategoryById,
  getFaqCategoryOptions,
} = await import("@/shared/domain/faq/queries");

const CATEGORY_ID = "11111111-1111-4111-8111-111111111111";
const OTHER_CATEGORY_ID = "22222222-2222-4222-8222-222222222222";

const FAKE_CATEGORY_DATES = {
  createdAt: new Date("2026-01-01T00:00:00.000Z"),
  updatedAt: new Date("2026-01-02T00:00:00.000Z"),
  deletedAt: null,
};

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

describe("getFaqHealthSummary — 横断ヘルス集計", () => {
  beforeEach(() => {
    mockFaqItemCount.mockClear();
  });

  test("下書き / 未更新 / 要改善 を 3 件並列集計する", async () => {
    const summary = await getFaqHealthSummary();

    expect(mockFaqItemCount).toHaveBeenCalledTimes(3);
    expect(summary).toEqual({
      draftCount: 0,
      staleCount: 0,
      lowRatedCount: 0,
    });

    // 下書き = 非公開
    expect(mockFaqItemCount).toHaveBeenCalledWith({
      where: expect.objectContaining({ isPublished: false }),
    });
    // 未更新 = 公開中 + updatedAt が古い
    expect(mockFaqItemCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isPublished: true,
        updatedAt: { lt: expect.any(Date) },
      }),
    });
    // 要改善 = 公開中 + notHelpfulCount >= しきい値
    expect(mockFaqItemCount).toHaveBeenCalledWith({
      where: expect.objectContaining({
        isPublished: true,
        notHelpfulCount: { gte: FAQ_LOW_RATED_MIN_NOT_HELPFUL },
      }),
    });
  });
});

describe("getFaqCategories — 過剰フェッチ解消（件数のみ取得）", () => {
  beforeEach(() => {
    mockFaqCategoryFindMany.mockClear();
    mockFaqItemGroupBy.mockClear();
  });

  test("items をネスト select せず _count のみを select する", async () => {
    await getFaqCategories();

    expect(mockFaqCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({
          _count: { select: { items: { where: { deletedAt: null } } } },
        }),
      }),
    );
    expect(mockFaqCategoryFindMany).not.toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.objectContaining({ items: expect.anything() }),
      }),
    );
  });

  test("全件数（_count）と公開件数（groupBy）をカテゴリごとに合成して返す", async () => {
    mockFaqCategoryFindMany.mockResolvedValueOnce([
      {
        id: CATEGORY_ID,
        name: "予約について",
        slug: "reservation",
        description: null,
        icon: null,
        order: 0,
        isActive: true,
        ...FAKE_CATEGORY_DATES,
        _count: { items: 5 },
      },
      {
        id: OTHER_CATEGORY_ID,
        name: "支払いについて",
        slug: "payment",
        description: null,
        icon: null,
        order: 1,
        isActive: true,
        ...FAKE_CATEGORY_DATES,
        _count: { items: 0 },
      },
    ]);
    mockFaqItemGroupBy.mockResolvedValueOnce([
      { categoryId: CATEGORY_ID, _count: { id: 3 } },
    ]);

    const result = await getFaqCategories();

    expect(result.total).toBe(2);
    expect(result.categories).toEqual([
      expect.objectContaining({
        id: CATEGORY_ID,
        itemCount: 5,
        publishedItemCount: 3,
      }),
      expect.objectContaining({
        id: OTHER_CATEGORY_ID,
        itemCount: 0,
        publishedItemCount: 0,
      }),
    ]);
    // items フィールドは含まれない（本文の過剰フェッチをしない契約）
    expect(result.categories[0]).not.toHaveProperty("items");
  });

  test("カテゴリが 0 件なら groupBy を呼ばない", async () => {
    await getFaqCategories();

    expect(mockFaqItemGroupBy).not.toHaveBeenCalled();
  });
});

describe("getFaqCategoryOptions — ドロップダウン用の軽量取得", () => {
  beforeEach(() => {
    mockFaqCategoryFindMany.mockClear();
  });

  test("id / name のみを select する", async () => {
    await getFaqCategoryOptions();

    expect(mockFaqCategoryFindMany).toHaveBeenCalledWith(
      expect.objectContaining({
        select: { id: true, name: true },
      }),
    );
  });
});

describe("getFaqCategoryById — 単体取得は items をネスト取得しない", () => {
  beforeEach(() => {
    mockFaqCategoryFindFirst.mockClear();
  });

  test("select に items ネストを含めない", async () => {
    await getFaqCategoryById(CATEGORY_ID);

    expect(mockFaqCategoryFindFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        select: expect.not.objectContaining({ items: expect.anything() }),
      }),
    );
  });

  test("取得したカテゴリを items なしで返す", async () => {
    mockFaqCategoryFindFirst.mockImplementationOnce(() =>
      Promise.resolve({
        id: CATEGORY_ID,
        name: "予約について",
        slug: "reservation",
        description: null,
        icon: null,
        order: 0,
        isActive: true,
        ...FAKE_CATEGORY_DATES,
      }),
    );

    const category = await getFaqCategoryById(CATEGORY_ID);

    expect(category).not.toBeNull();
    expect(category).not.toHaveProperty("items");
    expect(category?.id).toBe(CATEGORY_ID);
  });

  test("見つからない場合は null を返す", async () => {
    mockFaqCategoryFindFirst.mockImplementationOnce(() =>
      Promise.resolve(null),
    );

    const category = await getFaqCategoryById(CATEGORY_ID);

    expect(category).toBeNull();
  });
});
