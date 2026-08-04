import "server-only";

import { createHash } from "node:crypto";
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
import { TermsScope } from "@/shared/lib/validations/enums/prisma-types";
import type { TermsScopeValue } from "@/shared/lib/validations/enums/prisma-types";

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
} as const satisfies Prisma.TermsDocumentSelect;

const PUBLIC_DETAIL_SELECT = {
  id: true,
  type: true,
  slug: true,
  title: true,
  contentHtml: true,
  publishedAt: true,
  updatedAt: true,
} as const satisfies Prisma.TermsDocumentSelect;

const PUBLIC_REQUIRED_SELECT = {
  id: true,
  slug: true,
  title: true,
  contentHtml: true,
} as const satisfies Prisma.TermsDocumentSelect;

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
  /**
   * Phase 3.A (TERMS-REAGREE-P3A): 顧客の直近 `TermsAgreement.contentSnapshot`
   * (前回同意した HTML 全文)。初回同意 pending (未同意) なら null。
   * reagree UI で「以前同意した内容」を折り畳み表示するために使う。
   *
   * `getRequiredTermsByScope` (公開 4 経路の gate 用) では null で返る
   * (customer 依存でないため)。`getReagreeRequiredTermsForCustomer` のみが
   * agreement 履歴を join して値を埋める。
   */
  readonly previousSnapshot?: string | null;
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
 * 顧客単位で LOGIN_SIGNUP scope の再同意が必要な規約一覧を返す。
 *
 * 差分検出は `TermsAgreement.contentHash` (同意時の sha256 スナップショット) と
 * 現行 `TermsDocument.contentHtml` から on-the-fly で計算した sha256 の比較。
 * hash 一致なら「同版に同意済み」と判定し skip、不一致 (=版違い) または agreement
 * 未存在 (=cookie 消費失敗リカバリ、または scope 後付け追加) なら pending として返す。
 *
 * PII の customerId を含むため `"use cache"` は使えない (cache PII leak 監査)。
 * safeFetch で fallback を空にしない: 「差分なし」と誤認して redirect gate をすり抜ける
 * silent failure になるため、DB 例外は bubble させて mypage の error boundary で拾う
 * (fail-closed)。
 *
 * 対象 scope が LOGIN_SIGNUP のみである理由: RESERVATION / INQUIRY /
 * EVENT_REGISTRATION / RESERVATION_SERIES の各 scope は送信時に
 * `assertAllRequiredTermsAgreed` で「その時点の最新必須規約全件」を強制するため、
 * フォームを開いた時点で常に新版へ同意させる構造になっている。LOGIN_SIGNUP scope は
 * 初回サインアップの `SIGNUP_TERMS_COOKIE` 消費でしか記録されないため、再同意 gate が
 * 別途必要。
 */
export async function getReagreeRequiredTermsForCustomer(
  customerId: string,
): Promise<RequiredTerm[]> {
  const requiredDocs = await prisma.termsDocument.findMany({
    where: {
      deletedAt: null,
      isPublished: true,
      scopes: { has: TermsScope.LOGIN_SIGNUP },
    },
    orderBy: [{ displayOrder: "asc" }, { title: "asc" }],
    select: {
      id: true,
      slug: true,
      title: true,
      contentHtml: true,
    },
  });
  if (requiredDocs.length === 0) return [];

  const latestAgreements = await prisma.termsAgreement.findMany({
    where: {
      customerId,
      scope: TermsScope.LOGIN_SIGNUP,
      termsId: { in: requiredDocs.map((doc) => doc.id) },
    },
    orderBy: { agreedAt: "desc" },
    distinct: ["termsId"],
    // Phase 3.A (TERMS-REAGREE-P3A): contentSnapshot も select して
    // 「以前同意した内容」の折り畳み表示に使う。
    select: { termsId: true, contentHash: true, contentSnapshot: true },
  });
  const agreedHashByTermsId = new Map(
    latestAgreements.map((a) => [a.termsId, a.contentHash]),
  );
  const previousSnapshotByTermsId = new Map(
    latestAgreements.map((a) => [a.termsId, a.contentSnapshot]),
  );

  const pending = requiredDocs.filter((doc) => {
    const currentHash = createHash("sha256")
      .update(doc.contentHtml)
      .digest("hex");
    return agreedHashByTermsId.get(doc.id) !== currentHash;
  });

  return toPlainArray(
    pending.map((doc) => ({
      id: doc.id,
      slug: doc.slug,
      title: doc.title,
      contentHtml: doc.contentHtml,
      previousSnapshot: previousSnapshotByTermsId.get(doc.id) ?? null,
    })),
  );
}

/**
 * `assertAllRequiredTermsAgreed` 専用の最小 tx クライアント型。
 *
 * `src/shared/lib/reservation/types.ts` の `PrismaTransactionClient` と同型の
 * パターンで、`termsDocument.findMany` のみを要求する。app 標準 client
 * （`src/shared/db/prisma.ts`）は `$extends` していないので
 * `Prisma.TransactionClient` とも互換だが、必要な 1 メソッドだけを要求する方が
 * 呼び出し側を縛らずテストでも差し替えやすい（詳細は
 * `src/shared/domain/reservations/series-advisory-lock.ts` のコメント参照）。
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
 * `src/shared/domain/terms/consent-gate.ts` の同名関数（`agreedTermsIds: string[]`
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

/**
 * 指定 customer + scope + termsIds の**すべて**について TermsAgreement が
 * 既に記録済みかを返す（ALL-match）。
 *
 * 用途: `consumeSignupTermsAction` (MYPAGE-AUTH-03) の retry idempotency guard。
 * TermsAgreement には (customerId, scope, termsId) の DB uniqueness 制約が無いため、
 * リトライ経路 (insert 成功後に cookie 削除が persist しなかった等) で同一 cookie を
 * 再度消費すると duplicate row が積まれる。cookie 消費前に本関数で pre-check し、
 * 要求 ID がすべて揃っていれば insert を skip して cookie だけ削除する
 * (append-only 契約は維持)。1 件でも欠ける場合は false（部分記録は idempotent とみなさない）。
 *
 * `"use cache"` は付けない — LOGIN_SIGNUP の消費経路は書込直後の read-your-own-writes
 * が必要で、Data Cache の stale は許容できない。
 */
export async function hasTermsAgreementRecorded(input: {
  readonly customerId: string;
  readonly scope: TermsScope;
  readonly termsIds: readonly string[];
}): Promise<boolean> {
  if (input.termsIds.length === 0) return false;

  const uniqueIds = [...new Set(input.termsIds)];
  const found = await prisma.termsAgreement.findMany({
    where: {
      customerId: input.customerId,
      scope: input.scope,
      termsId: { in: uniqueIds },
    },
    select: { termsId: true },
    distinct: ["termsId"],
  });

  return found.length === uniqueIds.length;
}
