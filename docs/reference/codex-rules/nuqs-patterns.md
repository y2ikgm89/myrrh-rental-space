---
paths:
  - src/app/**
---

# nuqs パターンルール

> nuqs 2.8.8 / Next.js 16対応

## 概要

nuqsはURL状態管理ライブラリ。クエリパラメータを型安全に管理。

## NuqsAdapter（Root Layoutで必須）

公開ページ・管理画面の両Root Layoutに `NuqsAdapter` を配置する（PPR環境では `Suspense` でラップ）:

```typescript
// src/app/(admin)/layout.tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app'

export default function AdminRootLayout({ children }) {
  return (
    <html>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}

// src/app/(public)/layout.tsx（PPR環境 — Suspenseでラップ）
import { NuqsAdapter } from 'nuqs/adapters/next/app'

export default function PublicRootLayout({ children }) {
  return (
    <html>
      <body>
        {/* NuqsAdapter は内部で useSearchParams を使用するため Suspense でラップ */}
        <Suspense fallback={null}>
          <NuqsAdapter>{children}</NuqsAdapter>
        </Suspense>
      </body>
    </html>
  )
}
```

## 基本パターン

### 1. クライアントコンポーネント

```typescript
'use client'

import { useQueryState, parseAsString, parseAsInteger } from 'nuqs'

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

### 2. useQueryStates（複数パラメータ一括）

```typescript
'use client'

import { useQueryStates, parseAsString, parseAsInteger } from 'nuqs'
import { adminPageParsers } from '@/shared/lib/nuqs'  // 共有パーサーmap

function PageFilters() {
  // 共有パーサーmapを渡す
  const [params, setParams] = useQueryStates(adminPageParsers, {
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

// キャッシュ定義
const mySearchParamsCache = createSearchParamsCache({
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
})

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

### 5. クライアントコンポーネントでのkeyMap再利用

```typescript
'use client'

import { useQueryStates } from 'nuqs'
import { searchParamsCache } from './searchParams'

export function SearchControls() {
  // keyMapでキャッシュ定義のパーサー設定を再利用
  const [params, setParams] = useQueryStates(searchParamsCache.keyMap)

  return (
    <input
      value={params.q}
      onChange={(e) => setParams({ q: e.target.value })}
    />
  )
}
```

## パーサー一覧

### 組み込みパーサー

| パーサー | 型 | import元 |
|----------|-----|---------|
| `parseAsString` | `string` | `nuqs` / `nuqs/server` |
| `parseAsInteger` | `number` | `nuqs` / `nuqs/server` |
| `parseAsFloat` | `number` | `nuqs` / `nuqs/server` |
| `parseAsBoolean` | `boolean` | `nuqs` / `nuqs/server` |
| `parseAsStringLiteral` | リテラル型 | `nuqs` / `nuqs/server` |
| `parseAsStringEnum` | Enum型 | `nuqs` / `nuqs/server` |
| `parseAsArrayOf` | 配列 | `nuqs` / `nuqs/server` |
| `parseAsIsoDateTime` | `Date` | `nuqs` / `nuqs/server` |
| `parseAsTimestamp` | `Date` | `nuqs` / `nuqs/server` |
| `parseAsJson` | `T` | `nuqs` / `nuqs/server` |

**注意**: Client Component では `nuqs` から、Server Component / パーサー定義では `nuqs/server` から import する。

### カスタムパーサー

```typescript
// @/shared/lib/nuqs/parsers.ts
import { createParser } from 'nuqs/server'
import { toDateString } from '@/shared/lib/serialize'

export const parseAsDate = createParser<Date>({
  parse: (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },
  serialize: (date) => toDateString(date),
  eq: (a, b) => a.getTime() === b.getTime(),
})

// 注意: nuqs 組み込みの parseAsBoolean とは別物。
// 組み込み版は URL に `1`/`` を格納するが、こちらは `'true'`/`'false'` 文字列を扱うカスタム実装。
export const parseAsBoolean = createParser<boolean>({
  parse: (value) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return null
  },
  serialize: (value) => (value ? 'true' : 'false'),
})
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
  adminPageParsers,
  // ...
} from '@/shared/lib/nuqs'
```

**標準パーサー定義**:

```typescript
// ページネーション
export const parseAsPage = parseAsInteger.withDefault(1)
export const parseAsPerPage = parseAsInteger.withDefault(10)

// ソート
export type SortOrder = 'asc' | 'desc'
export const sortOrders: readonly SortOrder[] = ['asc', 'desc']
export const parseAsSortOrder = parseAsStringLiteral(sortOrders).withDefault('desc')

// 検索
export const parseAsQuery = parseAsString.withDefault('')

// 配列
export const parseAsCommaSeparated = parseAsArrayOf(parseAsString, ',')
```

**パーサーmapパターン**（Client Componentで `useQueryStates` に渡す）:

```typescript
// キャッシュと独立したパーサーmap（Client Component用）
export const adminPageParsers = {
  q: parseAsQuery,
  status: parseAsString.withDefault('all'),
  page: parseAsPage,
  sort: parseAsSortOrder,
}

// Client Componentで使用
const [params, setParams] = useQueryStates(adminPageParsers, {
  history: 'push',
  shallow: false,
})
```

## 型推論

```typescript
import type { inferParserType } from 'nuqs'

// パーサーから型を推論
type PageNumber = inferParserType<typeof parseAsPage>  // number
type SortOrderType = inferParserType<typeof parseAsSortOrder>  // 'asc' | 'desc'
```

## useFilterParams フック（管理画面共通）

管理画面のフィルター機能は共通フックを使用:

```typescript
'use client'

import {
  useFilterParams,
  useFilterParamsWithCategory,
} from '@/admin/hooks/use-filter-params'

// 基本フィルター（カテゴリなし）
const { params, setSearch, setSearchDebounced, setStatus, setPage, reset } =
  useFilterParams({ debounceMs: 300, defaultPerPage: 10 })

// カテゴリ付きフィルター
const { params, setCategory } =
  useFilterParamsWithCategory({ defaultStatus: '' })
```

フックは `useQueryStates` + `{ history: 'push', shallow: false }` で実装されており、`null` セット（URLパラメータ削除）と `page: 1` リセットを自動処理する。

## 禁止事項

1. **マジックストリング禁止**

   ```typescript
   // NG: パーサーなしのuseQueryState
   useQueryState('sort')

   // OK: パーサーを必ず渡す
   useQueryState('sort', parseAsSortOrder)
   ```

2. **型アサーション禁止**

   ```typescript
   // NG: 型アサーション
   params.sort as 'asc' | 'desc'

   // OK: parseAsSortOrder が型を保証
   const [sort] = useQueryState('sort', parseAsSortOrder)  // 'asc' | 'desc'
   ```

3. **直接的なURLSearchParams操作禁止**

   ```typescript
   // NG: 手動URLSearchParams
   const sp = new URLSearchParams(window.location.search)
   sp.set('page', '2')

   // OK: nuqsのsetParamsを使用
   void setParams({ page: 2 })
   ```

4. **パーサーの重複定義禁止**
   - `@/shared/lib/nuqs/parsers.ts` に集約。各ドメインファイルにはパーサーを定義しない

5. **Promise未処理の放置禁止**

   ```typescript
   // NG: 未処理のPromise（lintエラー）
   setParams({ page: 2 })

   // OK: voidで明示
   void setParams({ page: 2 })
   ```

6. **shallow: true での Server Component 更新禁止**

   ```typescript
   // NG: shallow: true だとServer Componentが再レンダリングされない
   useQueryStates(parsers, { history: 'push', shallow: true })

   // OK: Server Componentと連携する場合はshallow: false
   useQueryStates(parsers, { history: 'push', shallow: false })
   ```

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/nuqs/parsers.ts` | 共有パーサー定義・キャッシュ・ローダー関数・パーサーmap |
| `@/shared/lib/nuqs/index.ts` | barrel（`parsers.ts` を re-export） |
| `@/public/lib/search-params.ts` | 公開ページ専用のシンプルなキャッシュ定義 |
| `@/admin/hooks/use-filter-params.ts` | 管理画面フィルター共通フック |

## 参考

- [nuqs公式ドキュメント](https://nuqs.dev)
- [nuqs Server Side](https://nuqs.dev/docs/server-side)
- [nuqs Parsers](https://nuqs.dev/docs/parsers)
