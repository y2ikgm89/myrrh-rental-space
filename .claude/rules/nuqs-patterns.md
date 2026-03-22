---
paths:
  - src/app/**
---

# nuqs パターンルール

> nuqs 2.8.9 / Next.js 16対応

## 概要

nuqsはURL状態管理ライブラリ。クエリパラメータを型安全に管理。

## NuqsAdapter（`useQueryState(s)` を使う subtree の親）

公開ページ（`src/app/(public)/layout.tsx` の `FilterBar` 等）と管理ダッシュボード（`src/app/(admin)/admin/(dashboard)/layout.tsx`）でそれぞれラップする。Multiple Root Layouts のため二重ラップにはならない。実装は各レイアウトの `html` / `body` 構造に合わせる（公開側で `Suspense` が必要なら公式・既存レイアウトに従う）。

```typescript
// 例: 管理ダッシュボード
// src/app/(admin)/admin/(dashboard)/layout.tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app'

export default function DashboardLayout({ children }) {
  return (
    <NuqsAdapter>
      {children}
    </NuqsAdapter>
  )
}
```

## 基本パターン

### 1. クライアントコンポーネント

```typescript
'use client'

import { useQueryState, parseAsString, parseAsInteger, parseAsStringLiteral } from 'nuqs'

function SearchForm() {
  const [query, setQuery] = useQueryState('q', parseAsString.withDefault(''))
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))

  return (
    <input
      value={query}
      onChange={(e) => setQuery(e.target.value)}
    />
  )
}
```

**⚠️ options は `.withOptions()` でパーサーにチェーンする（3引数形式は非対応）**:

```typescript
// NG: 3引数形式（nuqs 2.8.8 非対応 — コンパイルエラー）
useQueryState("tab", parseAsStringLiteral(TAB_VALUES).withDefault("spaces"), {
  history: "push",
  shallow: false,
});

// OK: .withOptions() をパーサーにチェーン
const TAB_VALUES = ["spaces", "locations", "categories"] as const;
const [tab, setTab] = useQueryState(
  "tab",
  parseAsStringLiteral(TAB_VALUES)
    .withDefault("spaces")
    .withOptions({ history: "push", shallow: false }),
);
// void で floating promise を回避
const handleChange = (value: string) => {
  if (isValidTab(value)) void setTab(value);
};
```

**スペース管理との使い分け**: ハブのメインタブは **`Link` + `URLSearchParams`**（`SpaceManagementTabs`）で切り替え、一覧フィルタは `sp*` / `loc*` / `cat*` の **同一パーサーマップ**（`adminSpaceSearchParamsParsers` / `adminSpaceSearchParamsCache`）。**スペース新規・編集フォーム内のタブ**はクエリキー **`section`**（ハブの `tab` と衝突しない）。

### 2. useQueryStates（複数パラメータ一括）

```typescript
'use client'

import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import { adminPageSearchParamsParsers } from '@/shared/lib/nuqs'  // 共有パーサーmap

function PageFilters() {
  const [params, setParams] = useQueryStates(adminPageSearchParamsParsers, {
    history: 'push',   // URLを履歴に追加（ブラウザ「戻る」が機能する）
    shallow: false,    // Server Componentの再レンダリングを発火
  })

  // void で未処理のPromiseを明示
  const handleSearch = (value: string) => {
    void setParams({ q: value || null, page: 1 })
  }

  return <input value={params.q} onChange={(e) => handleSearch(e.target.value)} />
}
```

### 3. サーバーコンポーネント（createSearchParamsCache）

```typescript
// @/shared/lib/nuqs/parsers.ts
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
  type SearchParams,
} from 'nuqs/server'

const mySearchParamsParsers = {
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
}
const mySearchParamsCache = createSearchParamsCache(mySearchParamsParsers)

// ローダー関数（parse + all をラップ）
export async function loadMySearchParams(searchParams: Promise<SearchParams>) {
  await mySearchParamsCache.parse(searchParams)
  return mySearchParamsCache.all()
}

// page.tsx (Server Component)
import { loadMySearchParams } from '@/shared/lib/nuqs'
import type { SearchParams } from 'nuqs/server'

type PageProps = {
  searchParams: Promise<SearchParams>
}

export default async function Page({ searchParams }: PageProps) {
  // ローダー関数を使用（parse + all を一括）
  const params = await loadMySearchParams(searchParams)
  // params.q, params.page, params.limit が型安全

  return <div>Search: {params.q}</div>
}
```

**直接 parse する場合（ページ固有のキャッシュ）**:

```typescript
import { paginationSearchParams } from '@/public/lib/search-params'
import type { SearchParams } from 'nuqs/server'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // ⚠️ parse()を必ず呼び出す（RSCツリー全体でキャッシュ）
  const { page } = await paginationSearchParams.parse(searchParams)
  return <div>Page: {page}</div>
}
```

### 4. ネストされたサーバーコンポーネント（.get() / .all()）

```typescript
// 子のServer Componentでは再パース不要
import { mySearchParamsCache } from './searchParams'

export function Results() {
  // 再パースなしでキャッシュから個別取得
  const limit = mySearchParamsCache.get('limit')
  // 全パラメータ取得
  const allParams = mySearchParamsCache.all()
  return <div>Showing {limit} results per page</div>
}
```

### 5. クライアントで Server と同一のパーサーマップを import

nuqs 2.8 の `createSearchParamsCache` 戻り値に `keyMap` はない。export したパーサーオブジェクトを Server の `createSearchParamsCache(...)` と Client の `useQueryStates(...)` の両方で使う。

```typescript
'use client'

import { useQueryStates } from 'nuqs'
import { mySearchParamsParsers } from './searchParams'

export function SearchControls() {
  const [params, setParams] = useQueryStates(mySearchParamsParsers, {
    history: 'push',
    shallow: false,
  })

  return (
    <input
      value={params.q}
      onChange={(e) => void setParams({ q: e.target.value })}
    />
  )
}
```

## パーサー一覧

### 組み込みパーサー

`parseAsString`, `parseAsInteger`, `parseAsFloat`, `parseAsBoolean`, `parseAsStringLiteral`, `parseAsStringEnum`, `parseAsArrayOf`, `parseAsIsoDateTime`, `parseAsTimestamp`, `parseAsJson` 等。完全なリストは [nuqs Parsers 公式ドキュメント](https://nuqs.dev/docs/parsers) を参照。

**注意**: Client Component では `nuqs` から、Server Component / パーサー定義では `nuqs/server` から import する。

### カスタムパーサー

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

## プロジェクト標準パーサー

`@/shared/lib/nuqs/parsers.ts` に集約（`@/shared/lib/nuqs` barrel経由で re-export）:

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

**パーサーmapパターン**（1オブジェクトを cache と Client で共有）:

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

## 型推論

```typescript
import type { inferParserType } from "nuqs";

// パーサーから型を推論
type PageNumber = inferParserType<typeof parseAsPage>; // number
type SortOrderType = inferParserType<typeof parseAsSortOrder>; // 'asc' | 'desc'
```

## useFilterParams フック（管理画面共通）

管理画面のフィルター機能は共通フックを使用:

```typescript
"use client";

import {
  useFilterParams,
  useFilterParamsWithCategory,
} from "@/admin/hooks/use-filter-params";

// 基本フィルター（カテゴリなし）
const { params, setSearch, setSearchDebounced, setStatus, setPage, reset } =
  useFilterParams({ debounceMs: 300, defaultPerPage: 10 });

// カテゴリ付きフィルター
const { params, setCategory } = useFilterParamsWithCategory({
  defaultStatus: "",
});
```

フックは `adminCustomerSearchParamsParsers` を spread しつつ `perPage` / `categoryId` 等を合成した `useQueryStates` + `{ history: 'push', shallow: false }` で実装されており、`null` セット（URLパラメータ削除）と `page: 1` リセットを自動処理する。

## 禁止事項

1. **マジックストリング禁止**

   ```typescript
   // NG: パーサーなしのuseQueryState
   useQueryState("sort");

   // OK: パーサーを必ず渡す
   useQueryState("sort", parseAsSortOrder);
   ```

2. **型アサーション禁止**

   ```typescript
   // NG: 型アサーション
   params.sort as "asc" | "desc";

   // OK: parseAsSortOrder が型を保証
   const [sort] = useQueryState("sort", parseAsSortOrder); // 'asc' | 'desc'
   ```

3. **直接的な URL 操作は原則禁止（意図的例外あり）**

   ```typescript
   // NG: 手動でクエリだけ書き換え（フィルタ・ページネーション）
   const sp = new URLSearchParams(window.location.search);
   sp.set("page", "2");

   // OK: nuqsのsetParamsを使用
   void setParams({ page: 2 });
   ```

   **例外**: ハブのタブ切替で RSC をフルナビさせる `Link` の `href` 組み立て（例: `SpaceManagementTabs`）は `URLSearchParams` 可。

4. **パーサーの重複定義禁止**
   - `@/shared/lib/nuqs/parsers.ts` に集約。各ドメインファイルにはパーサーを定義しない

5. **Promise未処理の放置禁止**

   ```typescript
   // NG: 未処理のPromise（lintエラー）
   setParams({ page: 2 });

   // OK: voidで明示
   void setParams({ page: 2 });
   ```

6. **shallow: true での Server Component 更新禁止**

   ```typescript
   // NG: shallow: true だとServer Componentが再レンダリングされない
   useQueryStates(parsers, { history: "push", shallow: true });

   // OK: Server Componentと連携する場合はshallow: false
   useQueryStates(parsers, { history: "push", shallow: false });
   ```

   **例外・補足**
   - **RSC 一覧タブ**で URL の `searchParams` を正にしたい場合は、`Link` でクエリを更新するか `shallow: false` を使う（`admin-ui-patterns.md` のタブ (B)・スペース管理参照実装）。
   - **同一ページ内のクライアント専用タブ**（例: 編集フォームの「基本 / 料金」切替で RSC を再取得しない）は `shallow: true` や `useQueryState` のみでもよい。

## ファイル配置

| パス                                 | 内容                                                    |
| ------------------------------------ | ------------------------------------------------------- |
| `@/shared/lib/nuqs/parsers.ts`       | 共有パーサー定義・キャッシュ・ローダー関数・パーサーmap |
| `@/shared/lib/nuqs/index.ts`         | barrel（`parsers.ts` を re-export）                     |
| `@/public/lib/search-params.ts`      | 公開ページ専用のシンプルなキャッシュ定義                |
| `@/admin/hooks/use-filter-params.ts` | 管理画面フィルター共通フック                            |

## 参考

- [nuqs公式ドキュメント](https://nuqs.dev)
- [nuqs Server Side](https://nuqs.dev/docs/server-side)
- [nuqs Parsers](https://nuqs.dev/docs/parsers)
