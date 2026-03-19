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

export const paginationSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
});

export const spaceSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
});
