import "server-only";

import { cacheLife, cacheTag } from "next/cache";
import type { Prisma } from "@generated/prisma/client";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { CACHE_LIFE, CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import {
  ErrorCategory,
  ErrorSeverity,
  safeFetch,
} from "@/shared/lib/errors/server";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  TermsScope,
  TermsScopeValue,
} from "@/shared/lib/validations/enums/prisma-types";

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
  displayOrder: true,
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
  displayOrder: number;
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
        orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
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
        orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
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
 * 公開: type 一致の公開規約を1件取得（displayOrder 昇順の先頭）。
 *
 * type に一意制約は無いため同一 type の文書が複数存在し得るが、admin が
 * 明示的に設定する displayOrder（`deletedAt: null` 内で一意）を tie-break に
 * 使う（getFooterTerms/getPublishedTermsList と同じ並び順規約）。
 * 該当文書が無ければ null（呼び出し側はリンクを出さずプレーンテキストに
 * フォールバックする）。
 */
export async function getPublishedTermsByType(
  type: string,
): Promise<PublicTermsListItem | null> {
  "use cache";
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT);
  cacheTag(CACHE_TAGS.TERMS);

  const result = await safeFetch({
    fetch: () =>
      prisma.termsDocument.findFirst({
        where: { ...PUBLIC_WHERE, type },
        orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
        select: PUBLIC_LIST_SELECT,
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: "getPublishedTermsByType",
    context: { type },
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
        orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
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

/**
 * `assertAllRequiredTermsAgreed` 専用の最小 tx クライアント型。
 *
 * Prisma 拡張クライアント（`$extends` 済み `prisma`、`src/shared/db/prisma.ts`）の
 * interactive tx コールバック引数は、生成 Prisma の `Prisma.TransactionClient`
 * （拡張前の基底型）と `exactOptionalPropertyTypes: true` 下で構造的に非互換
 * （拡張後 model メソッドの `SelectSubset` 引数型が食い違う。詳細は
 * `src/shared/domain/reservations/series-advisory-lock.ts` のコメント参照）。
 * `src/shared/lib/reservation/types.ts` の `PrismaTransactionClient` と同型の
 * パターンで、`termsDocument.findMany` のみを要求する最小構造型にする。
 */
type TermsDocumentGateClient = {
  termsDocument: {
    findMany: (args: {
      where: Prisma.TermsDocumentWhereInput;
      select?: Prisma.TermsDocumentSelect;
    }) => Promise<{ id: string }[]>;
  };
};

export type AssertAllRequiredTermsAgreedInput = {
  readonly scope: TermsScopeValue;
  readonly agreements: readonly { termsId: string }[];
  readonly tx?: TermsDocumentGateClient;
};

/**
 * 指定 scope の必須規約に全て同意済みかを server-side で強制する gate（tx 対応版）。
 *
 * `src/shared/lib/terms-consent-gate.ts` の同名関数（`agreedTermsIds: string[]`
 * ベース・"use cache" な `getRequiredTermsByScope` 経由・tx 非対応・
 * `Promise<{matchedTermsIds}>` 返却）とは別物。公開 4 経路
 * (signup/reservation/inquiry/event-registration) の既存 consumer は
 * そちらを使い続ける（非破壊）。
 *
 * 本関数は RESERVATION_SERIES scope（Phase B.2 繰返し予約）向けに追加した。
 * `createReservationSeriesCommand`（Task 13）が interactive tx 内
 * （advisory lock 取得後）から呼べるよう、"use cache" を経由せず生 Prisma
 * クエリで実装する（cache 対象関数は tx オブジェクトを引数に取れない）。
 * tx 省略時は既定の `prisma` を使う。
 *
 * `scopes: { has: scope }` は既存 `getRequiredTermsByScope` と同じ SSoT filter
 * のため、Task 1/2 で `TermsScope` enum に追加済みの RESERVATION_SERIES を
 * 自動的に pick up する。
 */
export async function assertAllRequiredTermsAgreed(
  input: AssertAllRequiredTermsAgreedInput,
): Promise<void> {
  const client = input.tx ?? prisma;

  const requiredDocs = await client.termsDocument.findMany({
    where: {
      scopes: { has: input.scope },
      isPublished: true,
      deletedAt: null,
    },
    select: { id: true },
  });

  const agreedIds = new Set(input.agreements.map((a) => a.termsId));
  const hasMissing = requiredDocs.some((doc) => !agreedIds.has(doc.id));

  if (hasMissing) {
    throw new DomainError("すべての必須規約への同意が必要です", "VALIDATION");
  }
}
