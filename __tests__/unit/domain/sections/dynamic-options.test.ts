/**
 * getSectionDynamicOptions ユニットテスト
 *
 * faq-list セクションの categoryId select に渡す faqCategories は、
 * deletedAt: null に加えて isActive: true も満たす必要がある。
 * 公開側 getPublishedFaqItems は category.isActive: true を必須とするため、
 * 非アクティブカテゴリを選択肢に残すと選択後に常に 0 件表示になる。
 */

import { describe, test, expect, mock } from "bun:test";

const mockPostCategoryFindMany = mock<
  () => Promise<Array<{ id: string; name: string }>>
>(() => Promise.resolve([]));
const mockFaqCategoryFindMany = mock<
  () => Promise<Array<{ id: string; name: string }>>
>(() => Promise.resolve([]));

mock.module("server-only", () => ({}));

mock.module("@/shared/db/prisma", () => ({
  prisma: {
    postCategory: {
      findMany: mockPostCategoryFindMany,
    },
    faqCategory: {
      findMany: mockFaqCategoryFindMany,
    },
  },
}));

const { getSectionDynamicOptions } =
  await import("@/shared/domain/sections/dynamic-options");

describe("getSectionDynamicOptions", () => {
  test("faqCategory の取得条件は deletedAt: null と isActive: true の両方を含む", async () => {
    await getSectionDynamicOptions();

    expect(mockFaqCategoryFindMany).toHaveBeenCalledWith({
      where: { deletedAt: null, isActive: true },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    });
  });
});
