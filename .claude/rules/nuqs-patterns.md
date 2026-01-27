# nuqs パターンルール

> nuqs 2.x / Next.js 16対応

## 概要

nuqsはURL状態管理ライブラリ。クエリパラメータを型安全に管理。

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

### 2. サーバーコンポーネント

```typescript
// searchParams.ts
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString
} from 'nuqs/server'

export const searchParamsCache = createSearchParamsCache({
  q: parseAsString.withDefault(''),
  page: parseAsInteger.withDefault(1),
  limit: parseAsInteger.withDefault(10),
})

// page.tsx (Server Component)
import { searchParamsCache } from './searchParams'

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  // ⚠️ parse()を必ず呼び出す（RSCツリー全体でキャッシュ）
  const { q, page } = await searchParamsCache.parse(searchParams)

  return (
    <div>
      <h1>Search: {q}</h1>
      <Results />  {/* 子コンポーネントでもキャッシュにアクセス可能 */}
    </div>
  )
}

// results.tsx (Nested Server Component)
import { searchParamsCache } from './searchParams'

export function Results() {
  // 再パースなしでキャッシュから取得
  const limit = searchParamsCache.get('limit')
  return <div>Showing {limit} results per page</div>
}

// client.tsx (Client Component)
'use client'

import { useQueryStates } from 'nuqs'
import { searchParamsCache } from './searchParams'

export function SearchControls() {
  // keyMapでパーサー設定を再利用
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

| パーサー | 型 | 例 |
|----------|-----|-----|
| `parseAsString` | `string` | `'hello'` |
| `parseAsInteger` | `number` | `42` |
| `parseAsFloat` | `number` | `3.14` |
| `parseAsBoolean` | `boolean` | `true` / `false` |
| `parseAsStringLiteral` | リテラル型 | `'asc' \| 'desc'` |
| `parseAsArrayOf` | 配列 | `['a', 'b']` |

### カスタムパーサー

```typescript
// @/shared/lib/nuqs/parsers.ts
import { createParser } from 'nuqs/server'

export const parseAsDate = createParser<Date>({
  parse: (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },
  serialize: (date) => toDateString(date),
  eq: (a, b) => a.getTime() === b.getTime(),
})

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

`@/shared/lib/nuqs/parsers.ts` に集約:

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

## 型推論

```typescript
import type { inferParserType } from 'nuqs'

// パーサーから型を推論
type PageNumber = inferParserType<typeof parseAsPage>  // number
type SortOrderType = inferParserType<typeof parseAsSortOrder>  // 'asc' | 'desc'
```

## 禁止事項

1. **マジックストリング禁止**
   - `useQueryState('sort')` → `useQueryState('sort', parseAsSortOrder)`

2. **型アサーション禁止**
   - `params.sort as 'asc' | 'desc'` → `parseAsSortOrder`

3. **直接的なURLSearchParams操作禁止**
   - `new URLSearchParams()` → nuqsのパーサーを使用

4. **パーサーの重複定義禁止**
   - `@/shared/lib/nuqs/parsers.ts` に集約

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/nuqs/parsers.ts` | 共有パーサー、SearchParamsCache |
| `@/shared/hooks/use-filter-params.ts` | 汎用フィルターフック |

## 参考

- [nuqs公式ドキュメント](https://nuqs.dev)
- `docs/guides/nuqs.md` - プロジェクトガイド
