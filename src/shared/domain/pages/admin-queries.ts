import "server-only";

import { prisma, type Prisma } from "@/shared/db/prisma";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { PageData, PageListResult } from "./types";

const PAGES_MANAGED_ELSEWHERE = ["home", "posts", "news", "terms"];

export type PageListQueryParams = {
  query?: string;
  status?: string;
  type?: string;
  page?: number;
  perPage?: number;
  sortBy?: "updatedAt" | "title" | "slug";
  sortOrder?: "asc" | "desc";
};

export async function getHomepageLastUpdatedQuery(): Promise<Date | null> {
  const latest = await prisma.section.findFirst({
    where: { pageId: null },
    orderBy: { updatedAt: "desc" },
    select: { updatedAt: true },
  });

  return latest?.updatedAt ?? null;
}

export async function getPagesListQuery(
  params: PageListQueryParams = {},
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

  const where: Prisma.PageWhereInput = {
    isActive: true,
    slug: { notIn: [...PAGES_MANAGED_ELSEWHERE] },
  };

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

  const [pages, total] = await Promise.all([
    prisma.page.findMany({
      where,
      orderBy: { [sortBy]: sortOrder },
      skip: (page - 1) * perPage,
      take: perPage,
    }),
    prisma.page.count({ where }),
  ]);

  return { pages: toPlainArray(pages), total, page, perPage };
}

export async function getPageBySlugQuery(
  slug: string,
): Promise<PageData | null> {
  const page = await prisma.page.findUnique({
    where: { slug },
  });

  return toPlainObject(page);
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

export async function getDeletedPagesListQuery(): Promise<PageData[]> {
  const pages = await prisma.page.findMany({
    where: { isActive: false },
    orderBy: { updatedAt: "desc" },
  });

  return toPlainArray(pages);
}

export async function getSystemPagesListQuery(): Promise<PageData[]> {
  const pages = await prisma.page.findMany({
    where: {
      isActive: true,
      isSystemPage: true,
    },
    orderBy: { slug: "asc" },
  });

  return toPlainArray(pages);
}
