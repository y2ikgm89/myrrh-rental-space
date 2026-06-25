import "server-only";

import {
  getNewsById as getNewsByIdQuery,
  getNewsList as getNewsListQuery,
} from "@/shared/domain/news/admin-queries";
import type {
  GetNewsListResult,
  NewsData,
  NewsFilters,
  NewsPagination,
} from "@/shared/domain/news/types";
import { uuidIdSchema } from "@/shared/lib/validations/params";
import { requireAdminPermission } from "./_helpers";

const idSchema = uuidIdSchema("お知らせ");

export async function getNewsList(
  filters: NewsFilters = {},
  pagination: NewsPagination = {},
): Promise<GetNewsListResult> {
  await requireAdminPermission("news", "read");
  return getNewsListQuery(filters, pagination);
}

export async function getNewsById(id: string): Promise<NewsData | null> {
  await requireAdminPermission("news", "read");

  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return null;
  }

  return getNewsByIdQuery(validated.data);
}
