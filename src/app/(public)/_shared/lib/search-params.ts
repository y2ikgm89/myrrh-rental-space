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
  category: parseAsString.withDefault(""),
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
