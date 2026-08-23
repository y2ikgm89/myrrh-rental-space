/**
 * nuqs カスタムパーサー
 *
 * @description 型安全な URL パラメータパーサー。各リソースのパーサーマップを1つ定義し、
 *              `createSearchParamsCache(そのマップ)` と Client の `useQueryStates(同一マップ)` で共有する。
 * @see https://nuqs.dev/docs/parsers
 * @see https://nuqs.dev/docs/server-side
 */

import {
  ADMIN_SPACE_LIST_SORT_BY,
  ADMIN_SPACE_MANAGEMENT_TABS,
} from "@/shared/lib/constants/admin-space-management";
import {
  CouponType,
  CustomerType,
  EventStatus,
} from "@/shared/lib/validations/enums/prisma-types";
import {
  createParser,
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
  type SearchParams,
} from "nuqs/server";

import { MAX_PAGE_SIZE } from "@/shared/lib/pagination";

// ============================================================
// ページネーション
// ============================================================

/** ページ番号（1始まり、デフォルト: 1） */
export const parseAsPage = parseAsInteger.withDefault(1);

/**
 * 1 ページ件数の parser を作る。**URL 段で `MAX_PAGE_SIZE` へ clamp する**。
 *
 * 監査 A-87: 以前は素の `parseAsInteger.withDefault(n)` で上限が無く、
 * `?perPage=300000` が `paginate` を経て `take: 300000` になった。
 * `paginate` 側でも clamp するが、**表示される perPage と実際の take を一致させる**
 * ためにここでも止める（さもないと Select に 300000 が出るのに 100 件しか出ない）。
 */
function createPerPageParser(defaultValue: number) {
  return createParser<number>({
    parse: (value) => {
      const parsed = parseAsInteger.parse(value);
      if (parsed === null) return null;
      return Math.min(MAX_PAGE_SIZE, Math.max(1, Math.floor(parsed)));
    },
    serialize: (value) => String(value),
  }).withDefault(defaultValue);
}

/** 1ページあたりの件数（デフォルト: 10、上限 `MAX_PAGE_SIZE`） */
export const parseAsPerPage = createPerPageParser(10);

/** メディア一覧の 1 ページ件数（グリッド想定、既定 24、上限 `MAX_PAGE_SIZE`） */
export const parseAsMediaPerPage = createPerPageParser(24);

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
// 管理画面: イベント詳細 — 参加者一覧
// ============================================================
// NOTE: 公開スペース検索の SSoT は `src/app/(public)/_shared/lib/search-params.ts`
//       の `spaceSearchParamsParsers`。ここに重複定義は置かない。

export const registrationStatusFilterValues = [
  "CONFIRMED",
  "CANCELLED",
  "WAITLISTED",
  "WAITLISTED_OFFERED",
  "EXPIRED",
] as const;
export type RegistrationStatusFilter =
  (typeof registrationStatusFilterValues)[number];
const registrationStatusFilterSet = new Set<string>(
  registrationStatusFilterValues,
);
export function isRegistrationStatusFilter(
  value: string,
): value is RegistrationStatusFilter {
  return registrationStatusFilterSet.has(value);
}

const adminEventRegistrationsSearchParamsParsers = {
  search: parseAsQuery,
  // .withDefault なし: 既存の一覧は全ステータス表示が前提のため、フィルタ未指定
  // = null を「where に status 条件を追加しない」の意味で使う（Step 7 で undefined 変換）。
  status: parseAsStringLiteral(registrationStatusFilterValues),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
};

const adminEventRegistrationsSearchParamsCache = createSearchParamsCache(
  adminEventRegistrationsSearchParamsParsers,
);

/** イベント詳細の参加者一覧パラメータローダー（検索・ステータス・ページネーション） */
export async function loadAdminEventRegistrationsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventRegistrationsSearchParamsCache.parse(searchParams);
  return adminEventRegistrationsSearchParamsCache.all();
}

// ============================================================
// 管理画面: イベント詳細 — キャンセル待ち一覧
// ============================================================

const adminEventWaitlistSearchParamsCache = createSearchParamsCache({
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
});

/**
 * イベント詳細のキャンセル待ち一覧ページネーションパラメータローダー。
 * Round-4 audit Finding #20: 旧実装は pagination なしの無条件 findMany だった。
 */
export async function loadAdminEventWaitlistSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventWaitlistSearchParamsCache.parse(searchParams);
  return adminEventWaitlistSearchParamsCache.all();
}

// ============================================================
// 管理画面: スタッフ（ユーザー一覧）
// ============================================================

export const adminUserSearchParamsParsers = {
  search: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  role: parseAsString.withDefault(""),
  sortBy: parseAsString.withDefault("createdAt"),
  sortOrder: parseAsSortOrder,
};

const adminUserSearchParamsCache = createSearchParamsCache(
  adminUserSearchParamsParsers,
);

/** 管理画面ユーザー検索パラメータローダー */
export async function loadAdminUserSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminUserSearchParamsCache.parse(searchParams);
  return adminUserSearchParamsCache.all();
}

// ============================================================
// 管理画面: 監査ログ
// ============================================================

export const adminAuditLogSearchParamsParsers = {
  page: parseAsPage,
  perPage: parseAsPerPage,
  action: parseAsString.withDefault(""),
  resource: parseAsString.withDefault(""),
  userId: parseAsString.withDefault(""),
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
  search: parseAsString.withDefault(""),
  ipAddress: parseAsString.withDefault(""),
  securityOnly: parseAsString.withDefault(""),
};

const adminAuditLogSearchParamsCache = createSearchParamsCache(
  adminAuditLogSearchParamsParsers,
);

/** 管理画面監査ログ検索パラメータローダー */
export async function loadAdminAuditLogSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminAuditLogSearchParamsCache.parse(searchParams);
  return adminAuditLogSearchParamsCache.all();
}

// ============================================================
// 管理画面: クーポン
// ============================================================

/** クーポンステータスフィルター sentinel（"すべて" を表す） */
export const COUPON_STATUS_FILTER_ALL = "ALL" as const;
/** クーポンタイプフィルター sentinel（"すべて" を表す） */
export const COUPON_TYPE_FILTER_ALL = "ALL" as const;

const couponStatusFilterValues = [
  COUPON_STATUS_FILTER_ALL,
  "active",
  "inactive",
  "expired",
  "limitReached",
  "notStarted",
] as const;

export type CouponStatusFilter = (typeof couponStatusFilterValues)[number];

const couponTypeFilterValues = [
  COUPON_TYPE_FILTER_ALL,
  CouponType.PERCENTAGE,
  CouponType.FIXED_AMOUNT,
] as const;

export type CouponTypeFilter = (typeof couponTypeFilterValues)[number];

const couponStatusFilterSet = new Set<string>(couponStatusFilterValues);
const couponTypeFilterSet = new Set<string>(couponTypeFilterValues);

export function isCouponStatusFilter(
  value: string,
): value is CouponStatusFilter {
  return couponStatusFilterSet.has(value);
}

export function isCouponTypeFilter(value: string): value is CouponTypeFilter {
  return couponTypeFilterSet.has(value);
}

export const adminCouponSearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsStringLiteral(couponStatusFilterValues).withDefault(
    COUPON_STATUS_FILTER_ALL,
  ),
  type: parseAsStringLiteral(couponTypeFilterValues).withDefault(
    COUPON_TYPE_FILTER_ALL,
  ),
  page: parseAsPage,
  perPage: parseAsPerPage,
};

const adminCouponSearchParamsCache = createSearchParamsCache(
  adminCouponSearchParamsParsers,
);

/** 管理画面クーポン検索パラメータローダー */
export async function loadAdminCouponSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCouponSearchParamsCache.parse(searchParams);
  return adminCouponSearchParamsCache.all();
}

// ============================================================
// 管理画面: メディア
// ============================================================

export const adminMediaSearchParamsParsers = {
  search: parseAsQuery,
  type: parseAsString.withDefault(""),
  usage: parseAsString.withDefault(""),
  view: parseAsString.withDefault("grid"),
  page: parseAsPage,
  perPage: parseAsMediaPerPage,
};

const adminMediaSearchParamsCache = createSearchParamsCache(
  adminMediaSearchParamsParsers,
);

/** 管理画面メディア検索パラメータローダー */
export async function loadAdminMediaSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminMediaSearchParamsCache.parse(searchParams);
  return adminMediaSearchParamsCache.all();
}

// ============================================================
// 管理画面: 固定ページ一覧
// ============================================================

const adminPageStatusFilterValues = ["all", "published", "draft"] as const;
export type AdminPageStatusFilter =
  (typeof adminPageStatusFilterValues)[number];
const adminPageStatusFilterSet = new Set<string>(adminPageStatusFilterValues);
export function isAdminPageStatusFilter(
  value: string,
): value is AdminPageStatusFilter {
  return adminPageStatusFilterSet.has(value);
}

const adminPageTypeFilterValues = ["all", "system", "custom"] as const;
export type AdminPageTypeFilter = (typeof adminPageTypeFilterValues)[number];
const adminPageTypeFilterSet = new Set<string>(adminPageTypeFilterValues);
export function isAdminPageTypeFilter(
  value: string,
): value is AdminPageTypeFilter {
  return adminPageTypeFilterSet.has(value);
}

const adminPageSortByValues = ["updatedAt", "title", "slug"] as const;
export type AdminPageSortBy = (typeof adminPageSortByValues)[number];

export const adminPageSearchParamsParsers = {
  q: parseAsQuery,
  status: parseAsStringLiteral(adminPageStatusFilterValues).withDefault("all"),
  type: parseAsStringLiteral(adminPageTypeFilterValues).withDefault("all"),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
  sortBy: parseAsStringLiteral(adminPageSortByValues).withDefault("updatedAt"),
  sortOrder: parseAsSortOrder,
};

const adminPageSearchParamsCache = createSearchParamsCache(
  adminPageSearchParamsParsers,
);

/** 管理画面ページ管理検索パラメータローダー */
export async function loadAdminPageSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminPageSearchParamsCache.parse(searchParams);
  return adminPageSearchParamsCache.all();
}

// ============================================================
// 管理画面: 予約カレンダー
// ============================================================

export const adminCalendarSearchParamsParsers = {
  view: parseAsString.withDefault(""),
  date: parseAsString.withDefault(""),
  spaceId: parseAsString.withDefault(""),
  status: parseAsString.withDefault(""),
};

const adminCalendarSearchParamsCache = createSearchParamsCache(
  adminCalendarSearchParamsParsers,
);

/** 管理画面カレンダー検索パラメータローダー */
export async function loadAdminCalendarSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCalendarSearchParamsCache.parse(searchParams);
  return adminCalendarSearchParamsCache.all();
}

// ============================================================
// 管理画面: 顧客
// ============================================================

const adminCustomerSortByValues = [
  "createdAt",
  "lastReservationAt",
  "totalReservations",
  "totalSpent",
] as const;

export type AdminCustomerSortBy = (typeof adminCustomerSortByValues)[number];

/** 顧客種別フィルター（"ALL" は「すべて」を表す sentinel） */
export const CUSTOMER_TYPE_FILTER_ALL = "ALL" as const;

const customerTypeFilterValues = [
  CUSTOMER_TYPE_FILTER_ALL,
  CustomerType.PERSONAL,
  CustomerType.CORPORATE,
] as const;

export type CustomerTypeFilter = (typeof customerTypeFilterValues)[number];

/**
 * 顧客・お問い合わせ・予約一覧などのベース。
 * `BaseFilters` / `useFilterParams` の `perPage` とサーバー `limit` を一致させる。
 */
export const adminCustomerSearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  customerType: parseAsStringLiteral(customerTypeFilterValues).withDefault(
    CUSTOMER_TYPE_FILTER_ALL,
  ),
  flaggedOnly: parseAsBoolean.withDefault(false),
  sortBy: parseAsStringLiteral(adminCustomerSortByValues).withDefault(
    "createdAt",
  ),
  sortOrder: parseAsSortOrder,
  page: parseAsPage,
  perPage: parseAsPerPage,
};

const adminCustomerSearchParamsCache = createSearchParamsCache(
  adminCustomerSearchParamsParsers,
);

/** 管理画面顧客検索パラメータローダー */
export async function loadAdminCustomerSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCustomerSearchParamsCache.parse(searchParams);
  return adminCustomerSearchParamsCache.all();
}

const adminNewsTabs = ["posts", "meta"] as const;

const adminNewsSearchParamsParsers = {
  tab: parseAsStringLiteral(adminNewsTabs).withDefault("posts"),
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
  perPage: parseAsPerPage,
};

const adminNewsSearchParamsCache = createSearchParamsCache(
  adminNewsSearchParamsParsers,
);

/** 管理画面お知らせ検索パラメータローダー */
export async function loadAdminNewsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminNewsSearchParamsCache.parse(searchParams);
  return adminNewsSearchParamsCache.all();
}

// ============================================================
// 管理画面 FAQ
// ランディング `/admin/faq` はカテゴリ一覧（search params なし）、
// 詳細 `/admin/faq/[categoryId]` は配下の質問の検索/並び替え用パラメータのみを持つ。
// ============================================================

const adminFaqItemStatusValues = ["all", "published", "draft"] as const;
const adminFaqItemSortByValues = [
  "order",
  "updatedAt",
  "viewCount",
  "helpful",
  "createdAt",
] as const;
export type AdminFaqItemSortBy = (typeof adminFaqItemSortByValues)[number];

// コンテンツ健全性の絞り込み軸（公開ステータスとは独立）
const adminFaqItemQuickFilterValues = [
  "all",
  "recent",
  "stale",
  "low-rated",
] as const;
export type AdminFaqItemQuickFilter =
  (typeof adminFaqItemQuickFilterValues)[number];

export const adminFaqCategoryDetailSearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsStringLiteral(adminFaqItemStatusValues).withDefault("all"),
  quickFilter: parseAsStringLiteral(adminFaqItemQuickFilterValues).withDefault(
    "all",
  ),
  // 初回ランディングは "order" 昇順（管理者が手動設定した並び順）
  sortBy: parseAsStringLiteral(adminFaqItemSortByValues).withDefault("order"),
  sortOrder: parseAsStringLiteral(sortOrders).withDefault("asc"),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
};

const adminFaqCategoryDetailSearchParamsCache = createSearchParamsCache(
  adminFaqCategoryDetailSearchParamsParsers,
);

/** 管理画面 FAQ カテゴリ詳細ページの検索パラメータローダー */
export async function loadAdminFaqCategoryDetailSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminFaqCategoryDetailSearchParamsCache.parse(searchParams);
  return adminFaqCategoryDetailSearchParamsCache.all();
}

// FAQ レビュー（カテゴリ横断の「対応すべき項目」一覧）の絞り込み軸
const adminFaqReviewFilterValues = ["draft", "stale", "low-rated"] as const;
export type AdminFaqReviewFilter = (typeof adminFaqReviewFilterValues)[number];

export const adminFaqReviewSearchParamsParsers = {
  filter: parseAsStringLiteral(adminFaqReviewFilterValues).withDefault("draft"),
  search: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
};

const adminFaqReviewSearchParamsCache = createSearchParamsCache(
  adminFaqReviewSearchParamsParsers,
);

/** 管理画面 FAQ レビューページの検索パラメータローダー */
export async function loadAdminFaqReviewSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminFaqReviewSearchParamsCache.parse(searchParams);
  return adminFaqReviewSearchParamsCache.all();
}

// Phase 4 (ops surfaces): 顧客種別フィルター ("ALL" は「すべて」を表す sentinel、
// CUSTOMER_TYPE_FILTER_ALL は adminCustomerSearchParamsParsers と共有)。
const inquiryCustomerTypeFilterValues = [
  CUSTOMER_TYPE_FILTER_ALL,
  CustomerType.PERSONAL,
  CustomerType.CORPORATE,
] as const;

export type InquiryCustomerTypeFilter =
  (typeof inquiryCustomerTypeFilterValues)[number];

export const adminInquirySearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  assigneeId: parseAsString.withDefault(""),
  tagId: parseAsString.withDefault(""),
  customerType: parseAsStringLiteral(
    inquiryCustomerTypeFilterValues,
  ).withDefault(CUSTOMER_TYPE_FILTER_ALL),
  slaExpired: parseAsBoolean.withDefault(false),
  /** `<input type="date">` 形式 ("YYYY-MM-DD")。空文字列 = 未指定 */
  createdFrom: parseAsString.withDefault(""),
  createdTo: parseAsString.withDefault(""),
  page: parseAsPage,
  perPage: parseAsPerPage,
};

const adminInquirySearchParamsCache = createSearchParamsCache(
  adminInquirySearchParamsParsers,
);

/** 管理画面お問い合わせ検索パラメータローダー */
export async function loadAdminInquirySearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminInquirySearchParamsCache.parse(searchParams);
  return adminInquirySearchParamsCache.all();
}

const reservationSortByValues = ["startTime", "createdAt"] as const;

/** 管理画面 予約一覧のタブ（ステータスで分類） */
export const reservationTabFilterValues = [
  "pending",
  "confirmed",
  "completed",
  "cancelled",
  "all",
] as const;
export type ReservationTabFilter = (typeof reservationTabFilterValues)[number];
const reservationTabFilterSet = new Set<string>(reservationTabFilterValues);
export function isReservationTabFilter(
  value: string,
): value is ReservationTabFilter {
  return reservationTabFilterSet.has(value);
}

export const adminReservationSearchParamsParsers = {
  search: parseAsQuery,
  tab: parseAsStringLiteral(reservationTabFilterValues).withDefault(
    "confirmed",
  ),
  page: parseAsPage,
  perPage: parseAsPerPage,
  sortBy: parseAsStringLiteral(reservationSortByValues).withDefault(
    "startTime",
  ),
  sortOrder: parseAsSortOrder,
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
  // Round-4 audit Finding #14: staff 詳細ページの「予約一覧を表示」deep-link
  // (?userId=<staffId>) を実際にフィルタとして機能させる。Reservation.userId
  // (予約を作成した管理ユーザー) で絞り込む — Customer とは別軸。
  userId: parseAsString.withDefault(""),
  spaceId: parseAsString.withDefault(""),
};

const adminReservationSearchParamsCache = createSearchParamsCache(
  adminReservationSearchParamsParsers,
);

/** 管理画面予約検索パラメータローダー */
export async function loadAdminReservationSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminReservationSearchParamsCache.parse(searchParams);
  return adminReservationSearchParamsCache.all();
}

const adminPostTabs = ["posts", "categories", "tags", "meta"] as const;

const postSortByValues = ["createdAt", "publishedAt", "title"] as const;

/** 投稿管理ページ（タブ・一覧・コメント）で共有する URL パーサー */
export const adminPostSearchParamsParsers = {
  tab: parseAsStringLiteral(adminPostTabs).withDefault("posts"),
  status: parseAsString.withDefault(""),
  categoryId: parseAsString.withDefault(""),
  search: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  postId: parseAsString.withDefault(""),
  sortBy: parseAsStringLiteral(postSortByValues).withDefault("createdAt"),
  sortOrder: parseAsSortOrder,
  // Round-4 audit Finding #15: staff 詳細ページの「記事一覧を表示」deep-link
  // (?authorId=<staffId>) を実際にフィルタとして機能させる。
  authorId: parseAsString.withDefault(""),
};

const adminPostSearchParamsCache = createSearchParamsCache(
  adminPostSearchParamsParsers,
);

/** 管理画面投稿検索パラメータローダー */
export async function loadAdminPostSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminPostSearchParamsCache.parse(searchParams);
  return adminPostSearchParamsCache.all();
}

// ============================================================
// 投稿管理: タクソノミー（カテゴリー / タグ タブ）
// ============================================================

export const postTaxonomySortFields = [
  "name",
  "postCount",
  "createdAt",
] as const;
export type PostTaxonomySortField = (typeof postTaxonomySortFields)[number];

const postTaxonomyCategoryTabs = ["categories"] as const;

/** カテゴリー管理サブビュー用（`/admin/posts` の `tab=categories` 時） */
export const postTaxonomyCategorySearchParamsParsers = {
  search: parseAsQuery,
  tab: parseAsStringLiteral(postTaxonomyCategoryTabs).withDefault("categories"),
};

const postTaxonomyTagTabs = ["tags"] as const;

const parseAsTaxonomyTagSortOrder =
  parseAsStringLiteral(sortOrders).withDefault("asc");

/** タグ管理サブビュー用（`/admin/posts` の `tab=tags` 時） */
export const postTaxonomyTagSearchParamsParsers = {
  search: parseAsQuery,
  sortBy: parseAsStringLiteral(postTaxonomySortFields).withDefault("name"),
  sortOrder: parseAsTaxonomyTagSortOrder,
  unusedOnly: parseAsBoolean.withDefault(false),
  tab: parseAsStringLiteral(postTaxonomyTagTabs).withDefault("tags"),
};

const parseAsAdminSpaceSortBy = parseAsStringLiteral(
  ADMIN_SPACE_LIST_SORT_BY,
).withDefault("createdAt");

/**
 * スペース管理ハブ（`/admin/spaces`）の URL 状態。
 * タブごとにキーを分離し、タブ切替時も他タブのフィルタを汚染しない。
 */
export const adminSpaceSearchParamsParsers = {
  tab: parseAsStringLiteral(ADMIN_SPACE_MANAGEMENT_TABS).withDefault("spaces"),
  spSearch: parseAsQuery,
  spStatus: parseAsString.withDefault(""),
  spPage: parseAsPage,
  spPerPage: parseAsPerPage,
  spSortBy: parseAsAdminSpaceSortBy,
  spSortOrder: parseAsSortOrder,
  spLocationId: parseAsString.withDefault(""),
  spCategoryId: parseAsString.withDefault(""),
  locSearch: parseAsQuery,
  locStatus: parseAsString.withDefault(""),
  locPage: parseAsPage,
  locPerPage: parseAsPerPage,
  catSearch: parseAsQuery,
  catIncludeInactive: parseAsBoolean.withDefault(false),
  catPage: parseAsPage,
  catPerPage: parseAsPerPage,
  // Reviews タブ
  rvSearch: parseAsQuery,
  rvRating: parseAsString.withDefault(""),
  rvPublished: parseAsString.withDefault(""),
  rvSpaceId: parseAsString.withDefault(""),
  rvPage: parseAsPage,
  rvPerPage: parseAsPerPage,
};

export const adminSpaceSearchParamsCache = createSearchParamsCache(
  adminSpaceSearchParamsParsers,
);

// ============================================================
// 管理画面: イベント
// ============================================================

const eventSortByValues = [
  "startTime",
  "endTime",
  "createdAt",
  "updatedAt",
  "title",
] as const;

/** 管理画面 イベント一覧のタブ（時間軸 + ステータスで絞り込み） */
export const eventTabFilterValues = [
  "open",
  "past",
  "draft",
  "cancelled",
  "all",
] as const;
export type EventTabFilter = (typeof eventTabFilterValues)[number];
const eventTabFilterSet = new Set<string>(eventTabFilterValues);
export function isEventTabFilter(value: string): value is EventTabFilter {
  return eventTabFilterSet.has(value);
}

/** タブ "all" のときのみ表示する status Select の sentinel + 列挙 */
export const EVENT_STATUS_FILTER_ALL = "ALL" as const;
const eventStatusFilterValues = [
  EVENT_STATUS_FILTER_ALL,
  EventStatus.DRAFT,
  EventStatus.PUBLISHED,
  EventStatus.CANCELLED,
  EventStatus.ARCHIVED,
] as const;
export type EventStatusFilter = (typeof eventStatusFilterValues)[number];
const eventStatusFilterSet = new Set<string>(eventStatusFilterValues);
export function isEventStatusFilter(value: string): value is EventStatusFilter {
  return eventStatusFilterSet.has(value);
}

export const adminEventSearchParamsParsers = {
  search: parseAsQuery,
  status: parseAsStringLiteral(eventStatusFilterValues).withDefault(
    EVENT_STATUS_FILTER_ALL,
  ),
  tab: parseAsStringLiteral(eventTabFilterValues).withDefault("open"),
  page: parseAsPage,
  perPage: parseAsPerPage,
  sortBy: parseAsStringLiteral(eventSortByValues).withDefault("startTime"),
  sortOrder: parseAsSortOrder,
  dateFrom: parseAsString.withDefault(""),
  dateTo: parseAsString.withDefault(""),
};

const adminEventSearchParamsCache = createSearchParamsCache(
  adminEventSearchParamsParsers,
);

export async function loadAdminEventSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventSearchParamsCache.parse(searchParams);
  return adminEventSearchParamsCache.all();
}

// ============================================================
// 管理画面: イベントカテゴリ
// ============================================================

/**
 * キーに `cat*` のような prefix を付けない。専用ルート (`/admin/events/categories`) で
 * 単独の URL を持つため、同一 URL に他のタブの query key が同居しない。
 * prefix が要るのは `/admin/spaces` のような埋め込みタブ構成の方。
 */
export const adminEventCategorySearchParamsParsers = {
  search: parseAsQuery,
  includeInactive: parseAsBoolean.withDefault(false),
  page: parseAsPage,
  perPage: parseAsPerPage,
};

export const adminEventCategorySearchParamsCache = createSearchParamsCache(
  adminEventCategorySearchParamsParsers,
);

export async function loadAdminEventCategorySearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminEventCategorySearchParamsCache.parse(searchParams);
  return adminEventCategorySearchParamsCache.all();
}

// ============================================================
// 管理画面: 通知
// ============================================================

export const adminNotificationSearchParamsParsers = {
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
  type: parseAsString.withDefault(""),
  isRead: parseAsString.withDefault(""),
};

const adminNotificationSearchParamsCache = createSearchParamsCache(
  adminNotificationSearchParamsParsers,
);

/** 管理画面通知検索パラメータローダー */
export async function loadAdminNotificationSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminNotificationSearchParamsCache.parse(searchParams);
  return adminNotificationSearchParamsCache.all();
}

// ============================================================
// 管理画面: 規約同意記録 (TermsAgreement)
// ============================================================

/**
 * Round-4 audit Finding #19 / medium: 旧実装は Server Component 内で
 * `parsePositiveInt` / `parseScope` / `parseString` を手書きし、query 層
 * (getAdminAgreements) には scope/termsId/guestEmail を渡せていたが、それを
 * 設定する絞り込み UI が存在しなかった (20,000 件規模の一覧を手動 URL 編集
 * でしか絞れない)。他の一覧ページと同じ nuqs SSoT に統一し、client Filters
 * コンポーネントから設定できるようにする。
 */
export const adminTermsAgreementsSearchParamsParsers = {
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(50),
  scope: parseAsString.withDefault(""),
  termsId: parseAsString.withDefault(""),
  guestEmail: parseAsString.withDefault(""),
};

const adminTermsAgreementsSearchParamsCache = createSearchParamsCache(
  adminTermsAgreementsSearchParamsParsers,
);

/** 管理画面規約同意記録の検索パラメータローダー */
export async function loadAdminTermsAgreementsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminTermsAgreementsSearchParamsCache.parse(searchParams);
  return adminTermsAgreementsSearchParamsCache.all();
}
