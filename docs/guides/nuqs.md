# nuqs 実装ガイド

> **Note**: このドキュメントは nuqs ライブラリの実装状況とベストプラクティスを記載しています。

**最終更新**: 2026-01-07
**実装状況**: 公開ページ実装済み（/spaces, /posts）、管理画面計画中

---

## 概要

nuqs は、React アプリケーションで URL のクエリパラメータを型安全に管理するためのライブラリです。

### 導入メリット

| メリット | 説明 |
|---------|------|
| **型安全性** | TypeScript の型チェックを活用 |
| **URL 共有** | フィルタ状態を URL で共有可能 |
| **ブラウザ操作** | 戻る/進むボタンで状態を復元 |
| **ブックマーク** | 特定のフィルタ状態を保存可能 |
| **SEO** | 検索エンジンがフィルタ状態を認識可能 |

---

## 技術仕様

### バージョン要件

| パッケージ | バージョン | 備考 |
|-----------|-----------|------|
| **nuqs** | `2.8.6` | インストール済み |
| **Next.js** | `>=14.2.0` | 本プロジェクトは 16.1.1 |
| **React** | `^18.3 \|\| ^19` | 本プロジェクトは 19.2.3 |

### インストール

```bash
bun add nuqs
```

---

## 実装済みアーキテクチャ

### ディレクトリ構成

```
src/
├── app/
│   └── layout.tsx              # NuqsAdapter 配置
├── lib/
│   └── nuqs/
│       ├── index.ts            # エクスポート
│       ├── parsers.ts          # カスタムパーサー
│       └── search-params.ts    # 機能別 SearchParams 定義
└── app/(public)/spaces/
    ├── page.tsx                # Server Component（createLoader 使用）
    └── _components/
        ├── SpaceFilters.tsx    # Client（useQueryStates）
        └── Pagination.tsx      # Client（useQueryState）
```

### NuqsAdapter 設定

```typescript
// src/app/layout.tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app'

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="ja">
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}
```

> **Note**: `NuqsAdapter` はルートレイアウトにのみ配置。ネストされたレイアウトには不要。

---

## パーサー定義

### 汎用パーサー（`src/lib/nuqs/parsers.ts`）

```typescript
import {
  createParser,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral,
} from 'nuqs/server'

// ページネーション
export const parseAsPage = parseAsInteger.withDefault(1)
export const parseAsPerPage = parseAsInteger.withDefault(10)

// ソート
export const sortOrders = ['asc', 'desc'] as const
export type SortOrder = (typeof sortOrders)[number]
export const parseAsSortOrder = parseAsStringLiteral(sortOrders).withDefault('desc')

// フィルター
export const parseAsQuery = parseAsString.withDefault('')
export const parseAsCommaSeparated = parseAsArrayOf(parseAsString, ',')

// 日付
export const parseAsDate = createParser<Date>({
  parse: (value) => {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? null : date
  },
  serialize: (date) => date.toISOString().split('T')[0],
  eq: (a, b) => a.getTime() === b.getTime(),
})

// ブール値
export const parseAsBoolean = createParser<boolean>({
  parse: (value) => {
    if (value === 'true') return true
    if (value === 'false') return false
    return null
  },
  serialize: (value) => (value ? 'true' : 'false'),
})
```

### 機能別 SearchParams（`src/lib/nuqs/search-params.ts`）

```typescript
import { createLoader, createSearchParamsCache } from 'nuqs/server'
import { parseAsPage, parseAsPerPage, parseAsQuery, parseAsSortOrder } from './parsers'

// スペース一覧
export const spaceSearchParams = {
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  sort: parseAsSortOrder,
}

export const loadSpaceSearchParams = createLoader(spaceSearchParams)
export const spaceSearchParamsCache = createSearchParamsCache(spaceSearchParams)

// 投稿一覧
export const postSearchParams = {
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage,
  category: parseAsQuery,
  tags: parseAsCommaSeparated,
  sort: parseAsSortOrder,
}

export const loadPostSearchParams = createLoader(postSearchParams)
export const postSearchParamsCache = createSearchParamsCache(postSearchParams)
```

---

## 使用パターン

### Server Component での使用

```typescript
// src/app/(public)/spaces/page.tsx
import { loadSpaceSearchParams } from '@/lib/nuqs'
import type { SearchParams } from 'nuqs/server'

type PageProps = {
  searchParams: Promise<SearchParams>
}

export default async function SpacesPage({ searchParams }: PageProps) {
  // createLoader でパラメータを取得
  const { q, page, perPage, sort } = await loadSpaceSearchParams(searchParams)

  // Prisma クエリに使用
  const spaces = await prisma.space.findMany({
    where: {
      isPublished: true,
      ...(q && {
        OR: [
          { name: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
        ],
      }),
    },
    skip: (page - 1) * perPage,
    take: perPage,
    orderBy: { createdAt: sort },
  })

  return <SpaceList spaces={spaces} />
}
```

### Client Component での使用（複数パラメータ）

```typescript
// src/app/(public)/spaces/_components/SpaceFilters.tsx
'use client'

import { useQueryStates } from 'nuqs'
import { useTransition } from 'react'
import { parseAsQuery, parseAsSortOrder } from '@/lib/nuqs'

export function SpaceFilters() {
  const [isPending, startTransition] = useTransition()

  const [{ q, sort }, setParams] = useQueryStates(
    {
      q: parseAsQuery,
      sort: parseAsSortOrder,
    },
    {
      shallow: false,  // Server Component を再レンダリング
      scroll: false,   // スクロール位置を維持
      startTransition, // 遷移状態を管理
    }
  )

  const handleSearchChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setParams({ q: e.target.value || null })
  }

  return (
    <input
      type="search"
      value={q}
      onChange={handleSearchChange}
      disabled={isPending}
    />
  )
}
```

### Client Component での使用（単一パラメータ）

```typescript
// src/app/(public)/spaces/_components/Pagination.tsx
'use client'

import { useQueryState } from 'nuqs'
import { useTransition } from 'react'
import { parseAsPage } from '@/lib/nuqs'

export function Pagination({ currentPage, totalPages }: Props) {
  const [isPending, startTransition] = useTransition()

  const [, setPage] = useQueryState('page', {
    ...parseAsPage,
    shallow: false,
    scroll: true,
    startTransition,
  })

  const handlePageChange = (newPage: number) => {
    // デフォルト値（1）の場合は URL から削除
    setPage(newPage === 1 ? null : newPage)
  }

  return (
    <button onClick={() => handlePageChange(currentPage + 1)}>
      次へ
    </button>
  )
}
```

---

## オプション設定

### 主要オプション

| オプション | デフォルト | 説明 |
|-----------|-----------|------|
| `shallow` | `true` | `false` で Server Component 再レンダリング |
| `scroll` | `false` | `true` でページトップへスクロール |
| `history` | `'replace'` | `'push'` で履歴エントリを追加 |
| `clearOnDefault` | `true` | デフォルト値では URL から削除 |
| `startTransition` | - | React の useTransition と連携 |

### グローバルデフォルト設定

```typescript
<NuqsAdapter
  defaultOptions={{
    history: 'push',
    scroll: false,
    shallow: false,
  }}
>
  {children}
</NuqsAdapter>
```

---

## 実装状況

### 公開ページ（実装済み）

| ページ | 状態 | パラメータ |
|-------|------|-----------|
| `/spaces` | **完了** | `q`, `page`, `perPage`, `sort` |
| `/posts` | **完了** | `q`, `page`, `category`, `tags`, `sort` |
| `/news` | 計画中 | `page`, `perPage` |

### 管理画面（計画中）

| ページ | パラメータ |
|-------|-----------|
| `/admin/reservations` | `status`, `startDate`, `endDate`, `search`, `sort`, `view` |
| `/admin/customers` | `search`, `status`, `sort`, `sortOrder` |
| `/admin/posts` | `status`, `categoryId`, `search`, `sort` |
| `/admin/spaces` | `isPublished`, `search`, `sort` |
| `/admin/inquiries` | `status`, `sort` |

---

## ベストプラクティス

### 1. パーサー定義を共有

Server Components と Client Components で同じパーサー定義を使用し、型安全性を確保。

```typescript
// lib/nuqs/search-params.ts で定義
// Server: createLoader(spaceSearchParams)
// Client: useQueryStates(spaceSearchParams)
```

### 2. デフォルト値の活用

URL をクリーンに保つため、デフォルト値を設定。

```typescript
// ?page=1 ではなく、page がない場合は 1
export const parseAsPage = parseAsInteger.withDefault(1)
```

### 3. useTransition との連携

ローディング状態を適切に管理。

```typescript
const [isPending, startTransition] = useTransition()

const [params, setParams] = useQueryStates(parsers, {
  startTransition,
})
```

### 4. フィルタ変更時のページリセット

フィルタ変更時はページを 1 にリセット。

```typescript
const handleCategoryChange = (category: string | null) => {
  setParams({ category, page: null }) // null でデフォルト（1）に戻る
}
```

---

## 参考資料

### プロジェクトドキュメント

- [`Plans.md`](../../Plans.md) - 実装計画
- [`coding-standards.md`](coding-standards.md) - コーディング規約
- [`docs/requirements/type-safety.md`](./type-safety.md) - 型安全性要件

### 外部リソース

- [nuqs 公式ドキュメント](https://nuqs.dev/)
- [nuqs GitHub](https://github.com/47ng/nuqs)
- [Next.js App Router - Search Params](https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams)

---

## 更新履歴

- **2026-01-07**: 実装完了に伴い全面改訂。`createLoader` パターンに統一、実装済みコードを反映
- **2026-01-07**: `/posts` の検索・フィルタ・ページネーションを実装
- **2026-01-06**: 初版作成、nuqs 採用箇所の洗い出しと要件定義
