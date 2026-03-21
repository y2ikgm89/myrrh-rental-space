/**
 * nuqs カスタムパーサー
 *
 * @description 型安全な URL パラメータパーサーを提供
 * @see https://nuqs.dev/docs/parsers
 */

import {
  ADMIN_SPACE_MANAGEMENT_TABS,
} from "@/shared/lib/constants/admin-space-management";
import {
  createParser,
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type SearchParams,
} from "nuqs/server";

// ============================================================
// ページネーション
// ============================================================

/** ページ番号（1始まり、デフォルト: 1） */
export const parseAsPage = parseAsInteger.withDefault(1);

/** 1ページあたりの件数（デフォルト: 10） */
export const parseAsPerPage = parseAsInteger.withDefault(10);

// ============================================================
// ソート
// ============================================================

/** ソート順 */
export type SortOrder = "asc" | "desc";
export const sortOrders: readonly SortOrder[] = ["asc", "desc"];

export const parseAsSortOrder =
  parseAsStringLiteral(sortOrders).withDefault("desc");

// ============================================================
// フィルター（汎用）
// ============================================================

/** 検索クエリ（デフォルト: 空文字列） */
export const parseAsQuery = parseAsString.withDefault("");

/** カンマ区切りの配列 */
export const parseAsCommaSeparated = parseAsArrayOf(parseAsString, ",");

// ============================================================
// ブール値
// ============================================================

/** 文字列ブール値（'true'/'false'） */
export const parseAsBoolean = createParser<boolean>({
  parse: (value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  },
  serialize: (value) => (value ? "true" : "false"),
});

// ============================================================
// Search Params Caches (Server-side)
// ============================================================

/** スペース検索パラメータキャッシュ */
const spaceSearchParamsCache = createSearchParamsCache({
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  sort: parseAsSortOrder,
});

/** スペース検索パラメータローダー */
export async function loadSpaceSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await spaceSearchParamsCache.parse(searchParams);
  return spaceSearchParamsCache.all();
}

/** ブログ検索パラメータキャッシュ */
const blogSearchParamsCache = createSearchParamsCache({
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  category: parseAsString.withDefault(""),
  tags: parseAsCommaSeparated.withDefault([]),
  sort: parseAsSortOrder,
});

/** ブログ検索パラメータローダー */
export async function loadBlogSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await blogSearchParamsCache.parse(searchParams);
  return blogSearchParamsCache.all();
}

/** ニュース検索パラメータキャッシュ */
const newsSearchParamsCache = createSearchParamsCache({
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  sort: parseAsSortOrder,
});

/** ニュース検索パラメータローダー */
export async function loadNewsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await newsSearchParamsCache.parse(searchParams);
  return newsSearchParamsCache.all();
}

/** 管理画面ユーザー検索パラメータキャッシュ */
const adminUserSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  role: parseAsString.withDefault(""),
  sortBy: parseAsString.withDefault("createdAt"),
  sortOrder: parseAsSortOrder,
});

/** 管理画面ユーザー検索パラメータローダー */
export async function loadAdminUserSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminUserSearchParamsCache.parse(searchParams);
  return adminUserSearchParamsCache.all();
}

/** 管理画面監査ログ検索パラメータキャッシュ */
const adminAuditLogSearchParamsCache = createSearchParamsCache({
  page: parseAsPage,
  perPage: parseAsPerPage,
  action: parseAsString.withDefault(""),
  resource: parseAsString.withDefault(""),
  userId: parseAsString.withDefault(""),
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
});

/** 管理画面監査ログ検索パラメータローダー */
export async function loadAdminAuditLogSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminAuditLogSearchParamsCache.parse(searchParams);
  return adminAuditLogSearchParamsCache.all();
}

/** 管理画面クーポン検索パラメータキャッシュ */
const adminCouponSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  type: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面クーポン検索パラメータローダー */
export async function loadAdminCouponSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCouponSearchParamsCache.parse(searchParams);
  return adminCouponSearchParamsCache.all();
}

/** 管理画面メディア検索パラメータキャッシュ */
const adminMediaSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  type: parseAsString.withDefault(""),
  usage: parseAsString.withDefault(""),
  view: parseAsString.withDefault("grid"),
  page: parseAsPage,
});

/** 管理画面メディア検索パラメータローダー */
export async function loadAdminMediaSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminMediaSearchParamsCache.parse(searchParams);
  return adminMediaSearchParamsCache.all();
}

/** 管理画面コメント検索パラメータキャッシュ */
const adminCommentSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
  perPage: parseAsPerPage,
});

/** 管理画面コメント検索パラメータローダー */
export async function loadAdminCommentSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCommentSearchParamsCache.parse(searchParams);
  return adminCommentSearchParamsCache.all();
}

/** 管理画面ページ管理検索パラメータキャッシュ */
const adminPageSearchParamsCache = createSearchParamsCache({
  q: parseAsQuery,
  status: parseAsString.withDefault("all"),
  type: parseAsString.withDefault("all"),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
  sort: parseAsSortOrder,
});

/** 管理画面ページ管理検索パラメータローダー */
export async function loadAdminPageSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminPageSearchParamsCache.parse(searchParams);
  return adminPageSearchParamsCache.all();
}

/** 管理画面ページ管理パーサー（Client Component用） */
export const adminPageParsers = {
  q: parseAsQuery,
  status: parseAsString.withDefault("all"),
  type: parseAsString.withDefault("all"),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
  sort: parseAsSortOrder,
};

/** 管理画面カレンダー検索パラメータキャッシュ */
const adminCalendarSearchParamsCache = createSearchParamsCache({
  view: parseAsString.withDefault(""),
  date: parseAsString.withDefault(""),
  spaceId: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
});

/** 管理画面カレンダー検索パラメータローダー */
export async function loadAdminCalendarSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCalendarSearchParamsCache.parse(searchParams);
  return adminCalendarSearchParamsCache.all();
}

/** 管理画面顧客検索パラメータキャッシュ */
const adminCustomerSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面顧客検索パラメータローダー */
export async function loadAdminCustomerSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCustomerSearchParamsCache.parse(searchParams);
  return adminCustomerSearchParamsCache.all();
}

const adminNewsTabs = ["posts", "meta"] as const;

/** 管理画面お知らせ検索パラメータキャッシュ */
const adminNewsSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(adminNewsTabs).withDefault("posts"),
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面お知らせ検索パラメータローダー */
export async function loadAdminNewsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminNewsSearchParamsCache.parse(searchParams);
  return adminNewsSearchParamsCache.all();
}

/** 管理画面お問い合わせ検索パラメータキャッシュ */
const adminInquirySearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面お問い合わせ検索パラメータローダー */
export async function loadAdminInquirySearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminInquirySearchParamsCache.parse(searchParams);
  return adminInquirySearchParamsCache.all();
}

/** 管理画面予約検索パラメータキャッシュ */
const adminReservationSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面予約検索パラメータローダー */
export async function loadAdminReservationSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminReservationSearchParamsCache.parse(searchParams);
  return adminReservationSearchParamsCache.all();
}

const adminTermsTabs = ["list"] as const;

/** 管理画面利用規約検索パラメータキャッシュ */
const adminTermsSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(adminTermsTabs).withDefault("list"),
});

/** 管理画面利用規約検索パラメータローダー */
export async function loadAdminTermsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminTermsSearchParamsCache.parse(searchParams);
  return adminTermsSearchParamsCache.all();
}

const adminPostTabs = ["posts", "categories", "tags", "comments"] as const;

/** 管理画面投稿検索パラメータキャッシュ */
const adminPostSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(adminPostTabs).withDefault("posts"),
  status: parseAsString.withDefault(""),
  categoryId: parseAsString.withDefault(""),
  search: parseAsQuery,
  page: parseAsPage,
  postId: parseAsString.withDefault(""),
});

/** 管理画面投稿検索パラメータローダー */
export async function loadAdminPostSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminPostSearchParamsCache.parse(searchParams);
  return adminPostSearchParamsCache.all();
}

/** 管理画面スペース検索パラメータキャッシュ（スペース管理ページの RSC ツリーで `parse` 後に `get` / `all`） */
export const adminSpaceSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(ADMIN_SPACE_MANAGEMENT_TABS).withDefault("spaces"),
  search: parseAsQuery,
  status: parseAsString.withDefault(""), // SpaceTabContent: 'true' | 'false' | ''
  page: parseAsPage,
  published: parseAsString.withDefault(""), // LocationTabContent
  includeInactive: parseAsBoolean.withDefault(false), // CategoryTabContent（クライアントの parseAsBoolean と一致）
});

/** 管理画面スペース検索パラメータローダー（`loadAdminPostSearchParams` と同形で `all()` を返す） */
export async function loadAdminSpaceSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminSpaceSearchParamsCache.parse(searchParams);
  return adminSpaceSearchParamsCache.all();
}
