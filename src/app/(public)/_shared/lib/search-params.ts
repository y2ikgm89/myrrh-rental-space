/**
 * 公開ページ用 searchParams キャッシュ定義
 *
 * nuqs createSearchParamsCache でページネーション等のクエリパラメータを型安全に管理
 */

import { createSearchParamsCache, parseAsInteger } from "nuqs/server";

export const paginationSearchParams = createSearchParamsCache({
  page: parseAsInteger.withDefault(1),
});
