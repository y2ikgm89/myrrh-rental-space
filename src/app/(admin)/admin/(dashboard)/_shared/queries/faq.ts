import "server-only";

import { z } from "zod";
import {
  getDeletedFaqCategories as getDeletedFaqCategoriesQuery,
  getDeletedFaqItems as getDeletedFaqItemsQuery,
  getFaqCategories as getFaqCategoriesQuery,
  getFaqCategoryById as getFaqCategoryByIdQuery,
  getFaqItemById as getFaqItemByIdQuery,
  getFaqItems as getFaqItemsQuery,
} from "@/shared/domain/faq/queries";
import type {
  FaqCategoryListResult,
  FaqCategoryWithItems,
  FaqItemFilters,
  FaqItemListResult,
  FaqItemPagination,
  FaqItemSort,
  FaqItemWithCategory,
} from "@/shared/domain/faq/types";
import { requireAdminPermission } from "./_helpers";

const idSchema = z.uuid({ error: "IDが不正です" });

export async function getFaqCategories(): Promise<FaqCategoryListResult> {
  await requireAdminPermission("faq", "read");
  return getFaqCategoriesQuery();
}

export async function getFaqCategoryById(
  id: string,
): Promise<FaqCategoryWithItems | null> {
  await requireAdminPermission("faq", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getFaqCategoryByIdQuery(validated.data);
}

export async function getFaqItems(
  filters: FaqItemFilters = {},
  pagination: FaqItemPagination = {},
  sort?: FaqItemSort,
): Promise<FaqItemListResult> {
  await requireAdminPermission("faq", "read");
  return getFaqItemsQuery(filters, pagination, sort);
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
