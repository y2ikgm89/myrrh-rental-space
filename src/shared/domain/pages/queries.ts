import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { slugParamSchema } from "@/shared/lib/validations/params";
import { toPlainObject } from "@/shared/lib/serialize";

/**
 * 公開ページクエリの共通 where 句。Page model に deletedAt 列はないため
 * isPublished + isActive gate のみ。新規 query 追加時の gate 漏れを構造的に防ぐ。
 */
const PUBLIC_WHERE = {
  isPublished: true,
  isActive: true,
} as const satisfies Prisma.PageWhereInput;

export interface PageSeoData {
  title: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}

export type PublicPage = {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly isSystemPage: boolean;
};

export async function getPublicPage(slug: string): Promise<PublicPage | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGES, getCacheTag.pages.detail(slug));

  if (!slugParamSchema.safeParse(slug).success) return null;

  const page = await safeFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: {
          ...PUBLIC_WHERE,
          slug,
        },
        select: {
          id: true,
          slug: true,
          title: true,
          isSystemPage: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicPage",
  });

  if (!page) return null;
  return toPlainObject(page) satisfies PublicPage;
}

export async function getPageSeo(slug: string): Promise<PageSeoData | null> {
  "use cache";
  cacheLife(CACHE_LIFE.METADATA);
  cacheTag(CACHE_TAGS.PAGE_SEO, getCacheTag.pageSeo.detail(slug));

  if (!slugParamSchema.safeParse(slug).success) {
    return null;
  }

  const result = await safeFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: {
          ...PUBLIC_WHERE,
          slug,
        },
        select: {
          title: true,
          metaDescription: true,
          metaKeywords: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPageSeo",
  });

  if (!result) {
    return null;
  }

  return {
    title: result.title || slug,
    metaDescription: result.metaDescription ?? null,
    metaKeywords: result.metaKeywords ?? null,
    ogpTitle: result.ogpTitle ?? null,
    ogpDescription: result.ogpDescription ?? null,
    ogpImageUrl: result.ogpImageUrl ?? null,
  };
}
