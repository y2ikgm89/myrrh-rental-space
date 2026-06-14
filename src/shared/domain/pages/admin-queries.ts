import "server-only";

import { prisma } from "@/shared/db/prisma";
import type { Prisma } from "@generated/prisma/client";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { PageData, PageListResult } from "./types";

const PAGES_MANAGED_ELSEWHERE = ["posts", "news", "terms"];

export type PageListQueryParams = {
  query?: string | undefined;
  status?: string | undefined;
  type?: string | undefined;
  page?: number | undefined;
  perPage?: number | undefined;
  sortBy?: "updatedAt" | "title" | "slug" | undefined;
  sortOrder?: "asc" | "desc" | undefined;
};

export async function getPagesListQuery(
  params: PageListQueryParams = {},
  allowedPageIds?: readonly string[],
): Promise<PageListResult> {
  const {
    query,
    status = "all",
    type = "all",
    page = 1,
    perPage = 20,
    sortBy = "updatedAt",
    sortOrder = "desc",
  } = params;

  if (allowedPageIds && allowedPageIds.length === 0) {
    return { pages: [], total: 0, page, perPage };
  }

  const where: Prisma.PageWhereInput = {
    isActive: true,
    slug: { notIn: [...PAGES_MANAGED_ELSEWHERE] },
  };

  if (allowedPageIds) {
    where.id = { in: [...allowedPageIds] };
  }

  if (query) {
    where.OR = [
      { title: { contains: query, mode: "insensitive" } },
      { slug: { contains: query, mode: "insensitive" } },
    ];
  }

  if (status === "published") {
    where.isPublished = true;
  } else if (status === "draft") {
    where.isPublished = false;
  }

  if (type === "system") {
    where.isSystemPage = true;
  } else if (type === "custom") {
    where.isSystemPage = false;
  }

  // Tie-breaker: 非 updatedAt ソート時は updatedAt desc で安定化
  const orderBy: Prisma.PageOrderByWithRelationInput[] =
    sortBy === "updatedAt"
      ? [{ updatedAt: sortOrder }]
      : [{ [sortBy]: sortOrder }, { updatedAt: "desc" }];

  const [pages, total] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy,
      skip: (page - 1) * perPage,
      take: perPage,
      include: {
        _count: { select: { sections: true } },
      },
    }),
    prisma.page.count({ where }),
  ]);

  const pagesWithCount = pages.map(({ _count, ...rest }) => ({
    ...rest,
    sectionCount: _count.sections,
  }));

  return { pages: toPlainArray(pagesWithCount), total, page, perPage };
}

export async function getPageBySlugQuery(
  slug: string,
): Promise<PageData | null> {
  const page = await prisma.page.findUnique({
    where: { slug },
  });

  return toPlainObject(page);
}

/**
 * EDITOR の `userPageAssignment` チェック用に slug から page UUID を解決する。
 *
 * `executeAdminMutationResult` の `resolveResourceId` callback から呼ばれ、
 * 認証後に軽量 `findUnique` で `id` のみを取得する。
 */
export async function getPageIdBySlugQuery(
  slug: string,
): Promise<string | null> {
  const row = await prisma.page.findUnique({
    where: { slug },
    select: { id: true },
  });
  return row?.id ?? null;
}

export async function getPageForPublicQuery(
  slug: string,
): Promise<PageData | null> {
  const page = await prisma.page.findUnique({
    where: {
      slug,
      isPublished: true,
      isActive: true,
    },
  });

  return toPlainObject(page);
}

export async function getDeletedPagesListQuery(
  allowedPageIds?: readonly string[],
): Promise<PageData[]> {
  if (allowedPageIds && allowedPageIds.length === 0) {
    return [];
  }

  const pages = await prisma.page.findMany({
    where: {
      isActive: false,
      ...(allowedPageIds ? { id: { in: [...allowedPageIds] } } : {}),
    },
    orderBy: { updatedAt: "desc" },
  });

  return toPlainArray(pages);
}

export async function getSystemPagesListQuery(
  allowedPageIds?: readonly string[],
): Promise<PageData[]> {
  if (allowedPageIds && allowedPageIds.length === 0) {
    return [];
  }

  const pages = await prisma.page.findMany({
    where: {
      isActive: true,
      isSystemPage: true,
      ...(allowedPageIds ? { id: { in: [...allowedPageIds] } } : {}),
    },
    orderBy: { slug: "asc" },
  });

  return toPlainArray(pages);
}
