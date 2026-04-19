# nuqs パーサー追加

一覧ページの searchParams 用に **パーサーマップを 1 つ**定義し、Server と Client で同一マップを共有する（`nuqs-patterns.md` の単一ソースパターン）。

## `@/shared/lib/nuqs/parsers.ts`

```typescript
import {
  createSearchParamsCache,
  type SearchParams,
} from "nuqs/server";

const admin<Resource>SearchParamsParsers = {
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage, // 一覧の take/limit と必ず一致させる
};

const admin<Resource>SearchParamsCache = createSearchParamsCache(
  admin<Resource>SearchParamsParsers,
);

export { admin<Resource>SearchParamsParsers };

export async function loadAdmin<Resource>SearchParams(
  searchParams: Promise<SearchParams>,
) {
  await admin<Resource>SearchParamsCache.parse(searchParams);
  return admin<Resource>SearchParamsCache.all();
}
```

フィルター用 Client Component では `useQueryStates(admin<Resource>SearchParamsParsers, ...)` と同一マップを import する。実装は `loadAdminCouponSearchParams` / `adminCouponSearchParamsParsers` 等の既存定義を参照。
