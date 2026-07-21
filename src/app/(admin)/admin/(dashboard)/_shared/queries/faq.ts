import "server-only";

import { cache } from "react";
import {
  getDeletedFaqCategories as getDeletedFaqCategoriesQuery,
  getDeletedFaqItems as getDeletedFaqItemsQuery,
  getFaqCategories as getFaqCategoriesQuery,
  getFaqCategoryById as getFaqCategoryByIdQuery,
  getFaqCategoryOptions as getFaqCategoryOptionsQuery,
  getFaqHealthSummary as getFaqHealthSummaryQuery,
  getFaqItemById as getFaqItemByIdQuery,
  getFaqItems as getFaqItemsQuery,
} from "@/shared/domain/faq/queries";
import type {
  FaqCategoryData,
  FaqCategoryListResult,
  FaqCategoryOption,
  FaqCategoryWithItems,
  FaqHealthSummary,
  FaqItemFilters,
  FaqItemListResult,
  FaqItemPagination,
  FaqItemSort,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { requireAdminPermission } from "./_helpers";

const idSchema = uuidIdSchema("FAQ");

export async function getFaqCategories(): Promise<FaqCategoryListResult> {
  await requireAdminPermission("faq", "read");
  return getFaqCategoriesQuery();
}

export async function getFaqCategoryOptions(): Promise<FaqCategoryOption[]> {
  await requireAdminPermission("faq", "read");
  return getFaqCategoryOptionsQuery();
}

/**
 * `generateMetadata` と page body の両方から同一 id で呼ばれるため、
 * React cache() でリクエスト内メモ化し同一クエリの二重発行を防ぐ。
 */
export const getFaqCategoryById = cache(async function getFaqCategoryById(
  id: string,
): Promise<FaqCategoryData | null> {
  await requireAdminPermission("faq", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getFaqCategoryByIdQuery(validated.data);
});

export async function getFaqItems(
  filters: FaqItemFilters = {},
  pagination: FaqItemPagination = {},
  sort?: FaqItemSort,
): Promise<FaqItemListResult> {
  await requireAdminPermission("faq", "read");
  return getFaqItemsQuery(filters, pagination, sort);
}

export async function getFaqHealthSummary(): Promise<FaqHealthSummary> {
  await requireAdminPermission("faq", "read");
  return getFaqHealthSummaryQuery();
}

export async function getFaqItemById(
  id: string,
): Promise<FaqItemWithCategory | null> {
  await requireAdminPermission("faq", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getFaqItemByIdQuery(validated.data);
}

export async function getDeletedFaqItems(): Promise<FaqItemWithCategory[]> {
  await requireAdminPermission("faq", "read");
  return getDeletedFaqItemsQuery();
}

export async function getDeletedFaqCategories(): Promise<
  FaqCategoryWithItems[]
> {
  await requireAdminPermission("faq", "read");
  return getDeletedFaqCategoriesQuery();
}
