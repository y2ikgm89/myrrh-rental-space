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
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import type { TermsScope } from "@/shared/lib/validations/enums/prisma-types";

/**
 * 公開ページ向け規約クエリ
 * 軸: deletedAt: null + isPublished: true
 *
 * 公開クエリの共通 where 句。新規 query 追加時の soft-delete / publish gate 漏れ
 * を構造的に防ぐため必ずこの const をスプレッドする。
 */
const PUBLIC_WHERE = {
  deletedAt: null,
  isPublished: true,
} as const satisfies Prisma.TermsDocumentWhereInput;

const PUBLIC_LIST_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  publishedAt: true,
  showInFooter: true,
  footerOrder: true,
  updatedAt: true,
} as const;

const PUBLIC_DETAIL_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  contentHtml: true,
  publishedAt: true,
  updatedAt: true,
} as const;

const PUBLIC_REQUIRED_SELECT = {
  id: true,
  slug: true,
  title: true,
  contentHtml: true,
} as const;

export type PublicTermsListItem = Serialized<{
  id: string;
  type: string;
  slug: string;
  title: string;
  publishedAt: Date | null;
  showInFooter: boolean;
  footerOrder: number;
  updatedAt: Date;
}>;

export type PublicTermsDetail = Serialized<{
  id: string;
  type: string;
  slug: string;
  title: string;
  contentHtml: string;
  publishedAt: Date | null;
  updatedAt: Date;
}>;

export interface RequiredTerm {
  readonly id: string;
  readonly slug: string;
  readonly title: string;
  readonly contentHtml: string;
}

/**
 * 公開: 全公開規約を一覧取得（フッター含む）
 */
export async function getPublishedTermsList(): Promise<PublicTermsListItem[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS);

  const result = await safeFetch({
    fetch: () =>
      prisma.termsDocument.findMany({
        where: { ...PUBLIC_WHERE },
        orderBy: [{ footerOrder: "asc" }, { title: "asc" }],
        select: PUBLIC_LIST_SELECT,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedTermsList",
  });

  return toPlainArray(result);
}

/**
 * 公開: フッターに表示する規約のみ取得
 */
export async function getFooterTerms(): Promise<PublicTermsListItem[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS, getCacheTag.terms.footer());

  const result = await safeFetch({
    fetch: () =>
      prisma.termsDocument.findMany({
        where: {
          ...PUBLIC_WHERE,
          showInFooter: true,
        },
        orderBy: [{ footerOrder: "asc" }, { title: "asc" }],
        select: PUBLIC_LIST_SELECT,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getFooterTerms",
  });

  return toPlainArray(result);
}

/**
 * 公開: slug で公開中規約を取得
 */
export async function getPublicTermsBySlug(
  slug: string,
): Promise<PublicTermsDetail | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS, getCacheTag.terms.detail(slug));

  const result = await safeFetch({
    fetch: () =>
      prisma.termsDocument.findFirst({
        where: { ...PUBLIC_WHERE, slug },
        select: PUBLIC_DETAIL_SELECT,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublicTermsBySlug",
    context: { slug },
  });

  return result ? toPlainObject(result) : null;
}

/**
 * 公開: 指定 scope で同意必須に設定された規約一覧
 *
 * 旧 `getRequiredTermsAtReservation/Inquiry/Signup` 3 関数を統合した SSoT。
 * `scopes: { has: scope }` で Postgres ARRAY contains を使う。
 *
 * 公開 4 経路 (/login signup, /reservation, /contact, /events 申込) はすべて
 * 本関数を呼び出して required terms を取得する。
 */
export async function getRequiredTermsByScope(
  scope: TermsScope,
): Promise<RequiredTerm[]> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS);

  const result = await safeFetch({
    fetch: () =>
      prisma.termsDocument.findMany({
        where: {
          ...PUBLIC_WHERE,
          scopes: { has: scope },
        },
        orderBy: [{ footerOrder: "asc" }, { title: "asc" }],
        select: PUBLIC_REQUIRED_SELECT,
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getRequiredTermsByScope",
    context: { scope },
  });

  return toPlainArray(result);
}
