import "server-only";

import { prisma } from "@/shared/db/prisma";

export type DynamicCategoryOption = {
  readonly id: string;
  readonly name: string;
};

export type DynamicSectionOptions = {
  readonly postCategories: ReadonlyArray<DynamicCategoryOption>;
  readonly faqCategories: ReadonlyArray<DynamicCategoryOption>;
  readonly locations?: ReadonlyArray<DynamicCategoryOption>;
};

/**
 * セクション編集 UI の動的 select に渡す options を一括取得する。
 * post-list / faq-list セクションの categoryId field が利用する。
 *
 * 認証は consumer の Server Component / API route で行う（query 層は pure）。
 */
export async function getSectionDynamicOptions(): Promise<DynamicSectionOptions> {
  const [postCategories, faqCategories] = await Promise.all([
    prisma.postCategory.findMany({
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
    prisma.faqCategory.findMany({
      where: { deletedAt: null },
      select: { id: true, name: true },
      orderBy: { name: "asc" },
    }),
  ]);

  return { postCategories, faqCategories };
}
