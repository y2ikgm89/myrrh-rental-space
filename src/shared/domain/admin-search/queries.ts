import "server-only";

import { prisma } from "@/shared/db/prisma";
import { PAGES_MANAGED_ELSEWHERE } from "@/shared/domain/pages/admin-queries";
import type {
  SearchResultGroup,
  SearchResultItem,
} from "@/shared/lib/command-palette-types";
import type { Resource } from "@/shared/lib/admin-resources";
import { formatJstDateString } from "@/shared/lib/date-format";
import { keysOf } from "@/shared/lib/serialize";

const SEARCH_LIMIT_PER_RESOURCE = 5;

function ci(query: string) {
  return { contains: query, mode: "insensitive" as const };
}

/**
 * command-palette 検索 top-N の SSoT ordering。
 *
 * take: N without orderBy → PostgreSQL 実装依存の非決定順序で 5 件を返す。
 * 書込直後 / plan 変更 / VACUUM 後で「一覧に出たり消えたり」する silent UX 破綻
 * になるため、更新時刻の新しい順を第一キー、id ASC を stable tie-breaker と
 * して固定する (Round-3 audit Finding #23 / low)。updatedAt を持たないモデルは
 * createdAt を採用する。
 */
const ORDER_BY_UPDATED = [
  { updatedAt: "desc" as const },
  { id: "asc" as const },
];
const ORDER_BY_CREATED = [
  { createdAt: "desc" as const },
  { id: "asc" as const },
];

async function searchSpaces(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.space.findMany({
    where: {
      OR: [{ name: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, name: true, slug: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "space" as const,
    label: r.name,
    description: `/${r.slug}`,
    href: `/admin/spaces/${r.id}`,
  }));
}

async function searchCustomers(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.customer.findMany({
    where: {
      OR: [
        { lastName: ci(query) },
        { firstName: ci(query) },
        { email: ci(query) },
        { companyName: ci(query) },
      ],
    },
    select: { id: true, lastName: true, firstName: true, email: true },
    // Customer は updatedAt 列を持たないため createdAt を採用する。
    orderBy: ORDER_BY_CREATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "customer" as const,
    label: `${r.lastName} ${r.firstName ?? ""}`.trim(),
    description: r.email,
    href: `/admin/customers/${r.id}`,
  }));
}

async function searchReservations(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.reservation.findMany({
    where: {
      deletedAt: null,
      OR: [
        { customer: { lastName: ci(query) } },
        { customer: { email: ci(query) } },
        { space: { name: ci(query) } },
      ],
    },
    select: {
      id: true,
      startTime: true,
      customer: { select: { lastName: true } },
      space: { select: { name: true } },
    },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "reservation" as const,
    label: `${r.customer?.lastName ?? ""} ${r.space?.name ?? ""}`.trim(),
    // JST-DRIFT-01: toISOString().slice(0,10) は UTC 日付を返し、日本ローカル時刻の
    // 「深夜〜午前 9 時前」に当たる予約が前日日付で表示される silent bug。
    // date-format.ts の JST 固定 formatter (formatJstDateString) を使う。
    description: formatJstDateString(r.startTime),
    href: `/admin/reservations/${r.id}`,
  }));
}

async function searchPosts(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.post.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "post" as const,
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/posts/${r.id}`,
  }));
}

async function searchNews(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.news.findMany({
    where: {
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "news" as const,
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/news/${r.id}`,
  }));
}

/**
 * コマンドパレットのページ検索。
 *
 * **一覧経路と同じ絞り込みを掛ける**（監査 F-92 / F-115）。ここだけが
 * assignment も `isActive` も `PAGES_MANAGED_ELSEWHERE` も見ていなかったため、
 * EDITOR に**割当外の未公開ドラフト・ゴミ箱送りページのタイトルと slug**
 * （= 将来の公開 URL）が露出していた。クリック先の `/admin/pages/<slug>` は
 * `requireAdminResourcePermission` で notFound になるので、存在秘匿の方針とも
 * 矛盾していた。
 */
async function searchPages(
  query: string,
  scope: AdminSearchScope,
): Promise<SearchResultItem[]> {
  // EDITOR に割当が 1 件も無いなら検索する対象が無い。
  if (scope.allowedPageIds && scope.allowedPageIds.length === 0) return [];

  const rows = await prisma.page.findMany({
    where: {
      isActive: true,
      slug: { notIn: [...PAGES_MANAGED_ELSEWHERE] },
      ...(scope.allowedPageIds
        ? { id: { in: [...scope.allowedPageIds] } }
        : {}),
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: { id: true, title: true, slug: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "page" as const,
    label: r.title,
    description: `/${r.slug}`,
    href: `/admin/pages/${r.slug}`,
  }));
}

async function searchEvents(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.event.findMany({
    where: {
      deletedAt: null,
      OR: [{ title: ci(query) }, { slug: ci(query) }],
    },
    select: {
      id: true,
      title: true,
      slug: true,
      slots: {
        select: { startAt: true },
        orderBy: { startAt: "asc" as const },
        take: 1,
      },
    },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "event" as const,
    label: r.title,
    description: r.slots[0]?.startAt
      ? formatJstDateString(r.slots[0].startAt)
      : "",
    href: `/admin/events/${r.id}`,
  }));
}

async function searchInquiries(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.inquiry.findMany({
    where: {
      // Inquiry Overhaul Phase 1: soft-deleted は command palette から除外
      deletedAt: null,
      OR: [
        { name: ci(query) },
        { email: ci(query) },
        { subject: ci(query) },
        // ユーザー可視の受付番号 (INQ-XXXXXXXX) 検索 — subject 検索と同型で ILIKE 一致
        { receiptNumber: ci(query) },
      ],
    },
    select: { id: true, name: true, subject: true, receiptNumber: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "inquiry" as const,
    label: r.subject,
    description: `${r.receiptNumber}  ${r.name}`,
    href: `/admin/inquiries/${r.id}`,
  }));
}

async function searchFaqItems(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.faqItem.findMany({
    where: {
      deletedAt: null,
      OR: [{ question: ci(query) }, { answer: ci(query) }],
    },
    select: { id: true, question: true, categoryId: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "faq" as const,
    label: r.question,
    href: `/admin/faq/${r.categoryId}`,
  }));
}

async function searchCoupons(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.coupon.findMany({
    where: {
      OR: [{ code: ci(query) }, { name: ci(query) }],
    },
    select: { id: true, code: true, name: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "coupon" as const,
    label: `${r.code} (${r.name})`,
    href: `/admin/coupons/${r.id}`,
  }));
}

async function searchLocations(query: string): Promise<SearchResultItem[]> {
  const rows = await prisma.location.findMany({
    where: {
      OR: [{ name: ci(query) }, { address: ci(query) }],
    },
    select: { id: true, name: true },
    orderBy: ORDER_BY_UPDATED,
    take: SEARCH_LIMIT_PER_RESOURCE,
  });
  return rows.map((r) => ({
    id: r.id,
    resource: "location" as const,
    label: r.name,
    // Round-5 audit Finding #2: `/admin/spaces?tab=locations&edit=` は spaces
    // ページ側が `edit` クエリを解釈しない dead link だった。個別の場所は
    // `/admin/locations/[id]` という専用詳細ページを持つためそちらへ直リンクする。
    href: `/admin/locations/${r.id}`,
  }));
}

const SEARCH_BY_RESOURCE = {
  space: searchSpaces,
  customer: searchCustomers,
  reservation: searchReservations,
  post: searchPosts,
  news: searchNews,
  page: searchPages,
  event: searchEvents,
  inquiry: searchInquiries,
  faq: searchFaqItems,
  coupon: searchCoupons,
  location: searchLocations,
} satisfies Partial<
  Record<
    Resource,
    (q: string, scope: AdminSearchScope) => Promise<SearchResultItem[]>
  >
>;

type SearchableResource = keyof typeof SEARCH_BY_RESOURCE;

function isSearchableResource(
  resource: Resource,
): resource is SearchableResource {
  return resource in SEARCH_BY_RESOURCE;
}

/**
 * 検索結果に掛ける呼び出し元スコープ。
 *
 * 「EDITOR かどうか」ではなく**解決済みの id 集合**を受け取る。role を渡すと
 * 各 search 関数が独自に解決することになり、一覧経路との差が再び生まれる。
 */
export type AdminSearchScope = {
  /** EDITOR のとき閲覧を許された page の id。`undefined` は制限なし。 */
  readonly allowedPageIds?: readonly string[] | undefined;
};

export async function searchByResource(
  resource: Resource,
  query: string,
  scope: AdminSearchScope = {},
): Promise<SearchResultGroup> {
  if (!isSearchableResource(resource)) return { resource, items: [] };
  const items = await SEARCH_BY_RESOURCE[resource](query, scope);
  return { resource, items };
}

export const SEARCHABLE_RESOURCES: readonly Resource[] =
  keysOf(SEARCH_BY_RESOURCE);
