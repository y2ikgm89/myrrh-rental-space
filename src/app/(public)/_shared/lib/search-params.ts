/**
 * 公開ページ用 searchParams キャッシュ定義
 *
 * nuqs createSearchParamsCache でページネーション等のクエリパラメータを型安全に管理。
 * 全パーサーマップを export し、Client Component（useQueryStates）でも共有する。
 */

import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from "nuqs/server";

export const paginationSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
};

export const paginationSearchParams = createSearchParamsCache(
  paginationSearchParamsParsers,
);

export const spaceSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
  location: parseAsString,
};

export const spaceSearchParams = createSearchParamsCache(
  spaceSearchParamsParsers,
);

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
