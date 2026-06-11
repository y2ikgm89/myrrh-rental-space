---
description: nuqs 組み込み / カスタムパーサー + 新規 enum フィルター追加 best practice + プロジェクト標準パーサー集約 (`@/shared/lib/nuqs/parsers.ts`)
paths:
  - src/shared/lib/nuqs/**
  - src/app/**/_components/**Filters*
  - src/app/**/page.tsx
---

# nuqs パーサー定義 + プロジェクト標準

> 組み込み / カスタム parser + `parseAsStringLiteral` ベース enum フィルター + プロジェクト標準パーサー (`parseAsPage` / `parseAsSortOrder` 等) + パーサーマップ共有規約。

## 組み込みパーサー

`parseAsString`, `parseAsInteger`, `parseAsFloat`, `parseAsBoolean`, `parseAsStringLiteral`, `parseAsStringEnum`, `parseAsArrayOf`, `parseAsIsoDateTime`, `parseAsTimestamp`, `parseAsJson` 等。完全なリストは [nuqs Parsers 公式ドキュメント](https://nuqs.dev/docs/parsers) を参照。

**注意**: Client Component では `nuqs` から、Server Component / パーサー定義では `nuqs/server` から import する。

## カスタムパーサー

```typescript
// @/shared/lib/nuqs/parsers.ts
import { createParser } from "nuqs/server";
import { toDateString } from "@/shared/lib/serialize";

export const parseAsDate = createParser<Date>({
  parse: (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? null : date;
  },
  serialize: (date) => toDateString(date),
  eq: (a, b) => a.getTime() === b.getTime(),
});

// 注意: nuqs 組み込みの parseAsBoolean とは別物。
// 組み込み版は URL に `1`/`` を格納するが、こちらは `'true'`/`'false'` 文字列を扱うカスタム実装。
export const parseAsBoolean = createParser<boolean>({
  parse: (value) => {
    if (value === "true") return true;
    if (value === "false") return false;
    return null;
  },
  serialize: (value) => (value ? "true" : "false"),
});
```

## 新規 enum フィルター追加時の best practice

`parseAsString.withDefault("") + parseXxxFilter() narrowing helper` は禁止。
`parseAsStringLiteral(values as const).withDefault(SENTINEL)` を使う:

- Parser 自体が validation 責務を持つ（SSoT 化、別 helper 不要）
- Default 値は `clearOnDefault` により URL から自動除外（[nuqs 公式](https://nuqs.dev/docs/options)）
- Sentinel は `"ALL" as const` 等。空文字 `""` は Radix Select の placeholder 予約なので禁止
- 型は `(typeof values)[number]` で derive し、export して domain filter と揃える
- 参照実装: `adminCustomerSearchParamsParsers.customerType` (`CUSTOMER_TYPE_FILTER_ALL` sentinel)、`adminPageSearchParamsParsers.status` / `.type`（sentinel `"all"`）

**Select `onValueChange` の型安全 narrow**: `parseAsStringLiteral` で narrow 化した parser に Radix Select の `string` を代入するには、`as` ではなく型ガード関数を parsers.ts から export し `onValueChange` で narrow する（`type-safety.md` の `as` 禁止原則と整合）:

```typescript
// parsers.ts
const adminPageStatusFilterValues = ["all", "published", "draft"] as const;
const adminPageStatusFilterSet = new Set<string>(adminPageStatusFilterValues);
export function isAdminPageStatusFilter(v: string): v is AdminPageStatusFilter {
  return adminPageStatusFilterSet.has(v);
}

// Select onValueChange
onValueChange={(v) => {
  if (!isAdminPageStatusFilter(v)) return;
  void setParams({ status: v === "all" ? null : v, page: 1 });
}}
```

参照実装: `pages/_components/PageFilters.tsx`（`isAdminPageStatusFilter` / `isAdminPageTypeFilter`）

```typescript
const customerTypeFilterValues = [
  CUSTOMER_TYPE_FILTER_ALL,
  CustomerType.PERSONAL,
  CustomerType.CORPORATE,
] as const;
export type CustomerTypeFilter = (typeof customerTypeFilterValues)[number];

export const adminCustomerSearchParamsParsers = {
  customerType: parseAsStringLiteral(customerTypeFilterValues).withDefault(
    CUSTOMER_TYPE_FILTER_ALL,
  ),
  // ...
};
```

## プロジェクト標準パーサー

`@/shared/lib/nuqs/parsers.ts` に集約（`@/shared/lib/nuqs` barrel 経由で re-export）:

```typescript
import {
  parseAsPage,
  parseAsPerPage,
  parseAsSortOrder,
  parseAsQuery,
  parseAsCommaSeparated,
  parseAsDate,
  loadSpaceSearchParams,
  loadBlogSearchParams,
  loadAdminAuditLogSearchParams,
  adminPageSearchParamsParsers,
  adminSpaceSearchParamsParsers,
  // ...
} from "@/shared/lib/nuqs";
```

**標準パーサー定義**:

```typescript
// ページネーション
export const parseAsPage = parseAsInteger.withDefault(1);
export const parseAsPerPage = parseAsInteger.withDefault(10);

// ソート
export type SortOrder = "asc" | "desc";
export const sortOrders: readonly SortOrder[] = ["asc", "desc"];
export const parseAsSortOrder =
  parseAsStringLiteral(sortOrders).withDefault("desc");

// 検索
export const parseAsQuery = parseAsString.withDefault("");

// 配列
export const parseAsCommaSeparated = parseAsArrayOf(parseAsString, ",");
```

**パーサーマップパターン**（1 オブジェクトを cache と Client で共有）:

```typescript
export const adminPageSearchParamsParsers = {
  q: parseAsQuery,
  status: parseAsString.withDefault("all"),
  type: parseAsString.withDefault("all"),
  page: parseAsPage,
  perPage: parseAsInteger.withDefault(20),
  sort: parseAsSortOrder,
};

const adminPageSearchParamsCache = createSearchParamsCache(
  adminPageSearchParamsParsers,
);

export const adminPageParsers = adminPageSearchParamsParsers;

const [params, setParams] = useQueryStates(adminPageSearchParamsParsers, {
  history: "push",
  shallow: false,
});
```

## parsers.ts vs search-params.ts の責務境界

| ファイル           | 責務                                                                          | 形式                                                                                |
| ------------------ | ----------------------------------------------------------------------------- | ----------------------------------------------------------------------------------- |
| `parsers.ts`       | 管理画面 + 複数ページ共有のフル機能パーサー（sort / perPage / status 等含む） | `xxxSearchParamsParsers` + `createSearchParamsCache` + `loadXxxSearchParams` loader |
| `search-params.ts` | 公開ページ専用のシンプルな `page` + `q` キャッシュ                            | `xxxSearchParamsParsers` + `xxxSearchParams` を直 export（loader 関数なし）         |

**命名衝突による deadzcode の罠**: `search-params.ts` で `newsSearchParamsParsers` / `newsSearchParams` を export している場合、`parsers.ts` に private `newsSearchParamsParsers` + `loadNewsSearchParams` を追加すると import ゼロのデッドコードになる。`parsers.ts` でローダーを追加する前に `grep -r "loadXxxSearchParams" src/` で実際の消費者（page.tsx）を確認する。
