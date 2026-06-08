import "server-only";

import { z } from "zod";
import {
  getNewsById as getNewsByIdQuery,
  getNewsList as getNewsListQuery,
  getNewsVersions as getNewsVersionsQuery,
} from "@/shared/domain/news/admin-queries";
import type {
  GetNewsListResult,
  NewsData,
  NewsFilters,
  NewsPagination,
  NewsVersionData,
} from "@/shared/domain/news/types";
import { requireAdminPermission } from "./_helpers";

const idSchema = z.uuid({ error: "お知らせIDが不正です" });

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

export async function getNewsVersions(
  newsId: string,
): Promise<NewsVersionData[]> {
  await requireAdminPermission("news", "read");

  const validated = idSchema.safeParse(newsId);
  if (!validated.success) {
    return [];
  }

  return getNewsVersionsQuery(validated.data);
}
