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

/**
 * 固定ルート（システムページ）専用: ページ行が「存在するが非公開」かどうかを判定する。
 *
 * `getPublicPage` は `isPublished: false` の PUBLIC_WHERE gate により、
 * 「ページ行が存在しない」場合と「行は存在するが isPublished=false」の場合の
 * 両方で null を返す。固定ルートはこの 2 ケースを区別する必要がある
 * （前者は DB 未カスタマイズの初期状態として DEFAULT_PAGE_SECTIONS へフォールバックする
 * 正当な既存仕様、後者は 404 にすべき明示的な非公開状態）。
 *
 * `getPublicPage` と同じ cache tag を使うため、`updatePagePublished` の
 * invalidation（`CACHE_TAGS.PAGES` + `getCacheTag.pages.detail(slug)`）で
 * 追加配線なしに整合する。
 */
export async function isPublicPageUnpublished(slug: string): Promise<boolean> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.PAGES, getCacheTag.pages.detail(slug));

  if (!slugParamSchema.safeParse(slug).success) return false;

  const page = await safeFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: {
          slug,
          isActive: true,
        },
        select: {
          isPublished: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "isPublicPageUnpublished",
  });

  return page !== null && !page.isPublished;
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
