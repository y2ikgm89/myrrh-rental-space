/**
 * 公開ページ用 searchParams キャッシュ定義
 *
 * nuqs createSearchParamsCache でページネーション等のクエリパラメータを型安全に管理。
 * 全パーサーマップを export し、Client Component（useQueryStates）でも共有する。
 */

import {
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";
import { parseDateTimeLocalAsJst } from "@/shared/lib/date-format";

export const paginationSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
};

export const paginationSearchParams = createSearchParamsCache(
  paginationSearchParamsParsers,
);

/**
 * 公開スペース検索 facet の sort 軸 SSoT。
 * - `recommended` = name asc（推奨・既定）
 * - `capacity-asc` / `capacity-desc` = capacity 昇降
 * - `price-asc` / `price-desc` = hourlyPrice 昇降
 */
export const SPACE_SORT_VALUES = [
  "recommended",
  "capacity-asc",
  "capacity-desc",
  "price-asc",
  "price-desc",
] as const;
export type SpaceSort = (typeof SPACE_SORT_VALUES)[number];

const spaceSortSet = new Set<string>(SPACE_SORT_VALUES);
export function isSpaceSort(value: string): value is SpaceSort {
  return spaceSortSet.has(value);
}

/**
 * 公開 /spaces facet 検索の URL パラメータ SSoT。
 *
 * - `category` / `location` は単一選択（`null` = すべて）
 * - `q` はキーワード（空文字 = 未指定）
 * - `minCapacity` は最低収容人数（`null` = 未指定、下限フィルタ）
 * - `facilities` は複数選択（`,` 区切り、空配列 = 未指定）
 * - `date` / `startTime` / `endTime` は 3 つ全指定時のみ「時間帯空き検索」として有効
 *   （`YYYY-MM-DD` + `HH:MM` の JST wall-clock）
 * - `sort` は SPACE_SORT_VALUES から択一（既定 `recommended`）
 */
export const spaceSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
  location: parseAsString,
  q: parseAsString.withDefault(""),
  minCapacity: parseAsInteger,
  facilities: parseAsArrayOf(parseAsString, ",").withDefault([]),
  date: parseAsString.withDefault(""),
  startTime: parseAsString.withDefault(""),
  endTime: parseAsString.withDefault(""),
  sort: parseAsStringLiteral(SPACE_SORT_VALUES).withDefault("recommended"),
};

export const spaceSearchParams = createSearchParamsCache(
  spaceSearchParamsParsers,
);

/**
 * 時間帯 facet の 3 param (`date` / `startTime` / `endTime`) を JST wall-clock として
 * parse し、absolute UTC の `{ from, to }` を返す。
 *
 * - いずれか未指定 → `null`（時間帯 facet は 3 揃い時のみ有効）
 * - parse 失敗 → `null`
 * - `from >= to` → `null`（逆順・同時刻を silent に無効化）
 */
export function parseSpaceTimeRange(sp: {
  readonly date: string;
  readonly startTime: string;
  readonly endTime: string;
}): { from: Date; to: Date } | null {
  if (!sp.date || !sp.startTime || !sp.endTime) return null;
  const from = parseDateTimeLocalAsJst(`${sp.date}T${sp.startTime}`);
  const to = parseDateTimeLocalAsJst(`${sp.date}T${sp.endTime}`);
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return null;
  if (from.getTime() >= to.getTime()) return null;
  return { from, to };
}

export const searchFilterParsers = {
  q: parseAsString.withDefault(""),
  page: parseAsInteger.withDefault(1),
};

export const newsSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(""),
};

export const newsSearchParams = createSearchParamsCache(
  newsSearchParamsParsers,
);

export const postsSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(""),
};

export const postsSearchParams = createSearchParamsCache(
  postsSearchParamsParsers,
);

export const EVENT_VIEWS = ["list", "calendar"] as const;
export type EventView = (typeof EVENT_VIEWS)[number];

const eventViewSet = new Set<string>(EVENT_VIEWS);
export function isEventView(value: string): value is EventView {
  return eventViewSet.has(value);
}

export const eventsSearchParamsParsers = {
  view: parseAsStringLiteral(EVENT_VIEWS).withDefault("list"),
  y: parseAsInteger,
  m: parseAsInteger,
};

export const eventsSearchParams = createSearchParamsCache(
  eventsSearchParamsParsers,
);

export const reservationSearchParamsParsers = {
  spaceId: parseAsString,
};

export const reservationSearchParams = createSearchParamsCache(
  reservationSearchParamsParsers,
);

export const MYPAGE_RESERVATION_TABS = ["active", "past"] as const;
export type MypageReservationTab = (typeof MYPAGE_RESERVATION_TABS)[number];

const mypageReservationTabSet = new Set<string>(MYPAGE_RESERVATION_TABS);
export function isMypageReservationTab(
  value: string,
): value is MypageReservationTab {
  return mypageReservationTabSet.has(value);
}

// withDefault を付けない（URL 未指定 = null）。初期タブは予約状況で動的決定するため、
// 既定値を固定せず消費側で `?? (active があれば active / なければ past)` に委ねる。
// クライアント常駐タブのみで描画完結するためサーバ用 cache は不要。
export const mypageReservationsSearchParamsParsers = {
  tab: parseAsStringLiteral(MYPAGE_RESERVATION_TABS),
};

export const MYPAGE_EVENT_TABS = ["active", "past"] as const;
export type MypageEventTab = (typeof MYPAGE_EVENT_TABS)[number];

const mypageEventTabSet = new Set<string>(MYPAGE_EVENT_TABS);
export function isMypageEventTab(value: string): value is MypageEventTab {
  return mypageEventTabSet.has(value);
}

// mypageReservations と完全対称: URL 未指定時は申込状況で初期タブを動的決定するため withDefault なし。
export const mypageEventsSearchParamsParsers = {
  tab: parseAsStringLiteral(MYPAGE_EVENT_TABS),
};
