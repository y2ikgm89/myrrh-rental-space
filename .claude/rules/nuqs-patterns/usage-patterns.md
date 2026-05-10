---
description: nuqs 5 基本パターン（useQueryState / useQueryStates / createSearchParamsCache / ネスト SC / Client-Server パーサー共有）
paths:
  - src/app/**
  - src/**/_components/**
  - src/**/queries.ts
---

# nuqs 基本パターン

> Client Component / Server Component / ネスト SC / Client-Server 共有の 5 パターン + `.withOptions()` チェーン規律。

## 1. クライアントコンポーネント

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

**⚠️ options は `.withOptions()` でパーサーにチェーンする（3 引数形式は非対応）**:

```typescript
// NG: 3 引数形式（nuqs 2.8.8 非対応 — コンパイルエラー）
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

## 2. useQueryStates（複数パラメータ一括）

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

## 3. サーバーコンポーネント（createSearchParamsCache）

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
  // ⚠️ parse() を必ず呼び出す（RSC ツリー全体でキャッシュ）
  const { page } = await paginationSearchParams.parse(searchParams)
  return <div>Page: {page}</div>
}
```

## 4. ネストされたサーバーコンポーネント（.get() / .all()）

```typescript
// 子の Server Component では再パース不要
import { mySearchParamsCache } from './searchParams'

export function Results() {
  // 再パースなしでキャッシュから個別取得
  const limit = mySearchParamsCache.get('limit')
  // 全パラメータ取得
  const allParams = mySearchParamsCache.all()
  return <div>Showing {limit} results per page</div>
}
```

## 5. クライアントで Server と同一のパーサーマップを import

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
