/**
 * 公開ページ用 searchParams キャッシュ定義
 *
 * nuqs createSearchParamsCache でページネーション等のクエリパラメータを型安全に管理
 */

import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from "nuqs/server";

const paginationSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
};

export const paginationSearchParams = createSearchParamsCache(
  paginationSearchParamsParsers,
);

const spaceSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
};

export const spaceSearchParams = createSearchParamsCache(
  spaceSearchParamsParsers,
);

const newsSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(""),
};

export const newsSearchParams = createSearchParamsCache(
  newsSearchParamsParsers,
);

const postsSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(""),
  category: parseAsString.withDefault(""),
};

export const postsSearchParams = createSearchParamsCache(
  postsSearchParamsParsers,
);

const journalSearchParamsParsers = {
  page: parseAsInteger.withDefault(1),
  q: parseAsString.withDefault(""),
  tab: parseAsString.withDefault("all"),
};

export const journalSearchParams = createSearchParamsCache(
  journalSearchParamsParsers,
);
