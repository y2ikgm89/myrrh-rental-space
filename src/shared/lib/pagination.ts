/**
 * 共通ページネーション入力。各 entity の `XxxPagination` 型は
 * `PaginationInput<XxxSortBy>` を `&` で sortBy/sortOrder 制約とともに使うか、
 * 直接 type alias する。
 */
export type PaginationInput<TSortBy extends string = string> = {
  page?: number;
  limit?: number;
  sortBy?: TSortBy;
  sortOrder?: "asc" | "desc";
};

/**
 * page/limit を受け取り、Prisma に渡す `skip`/`take` と
 * sanitized な `page`/`limit` を返す SSoT helper。
 *
 * - `page` < 1 / 非整数 / undefined → 1 に clamp
 * - `limit` < 1 / 非整数 / undefined → 10 に clamp
 *
 * 入力は `exactOptionalPropertyTypes: true` 配下で `{ page: undefined }`
 * を渡せるよう、明示 union を許容する（`PaginationInput` は厳密に optional のため
 * 別 input 型を取る）。
 */
export function paginate(input: {
  page?: number | undefined;
  limit?: number | undefined;
}): {
  skip: number;
  take: number;
  page: number;
  limit: number;
} {
  const safePage = Math.max(1, Math.floor(input.page ?? 1));
  const safeLimit = Math.max(1, Math.floor(input.limit ?? 10));
  return {
    skip: (safePage - 1) * safeLimit,
    take: safeLimit,
    page: safePage,
    limit: safeLimit,
  };
}

/**
 * `Math.ceil(total / limit)` の SSoT。各 queries.ts が `items`/`page`/`limit` を
 * 自前で組み立てる (result の items キーが entity 毎に異なる) 用途に統一。
 */
export function calcTotalPages(total: number, limit: number): number {
  return Math.ceil(total / limit);
}
