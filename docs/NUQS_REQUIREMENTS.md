# nuqs採用要件定義

> **Note**: このドキュメントには、nuqsライブラリの採用箇所と実装要件が記載されています。nuqsは型安全なクエリパラメータ管理ライブラリで、Next.js 16 App Routerと完全に互換性があります。

**最終更新**: 2026-01-06

---

## 概要

nuqsは、ReactアプリケーションでURLのクエリパラメータを型安全に管理するためのライブラリです。このプロジェクトでは、フィルタ、ソート、検索、ページネーションなどの状態をURLに同期させることで、以下のメリットを実現します：

- **型安全性**: TypeScriptの型チェックを活用したクエリパラメータ管理
- **URL共有**: フィルタ状態をURLで共有可能
- **ブラウザ操作**: 戻る/進むボタンで状態を復元
- **ブックマーク**: 特定のフィルタ状態をブックマーク可能
- **SEO**: 検索エンジンがフィルタ状態を認識可能

---

## 技術仕様

### バージョン要件

- **nuqs**: `2.8.5`（最新安定版、Next.js 16 App Router対応）
- **Next.js**: `>=14.2.0`（本プロジェクトは16.1.1を使用）
- **React**: `^18.3 || ^19`（本プロジェクトは19.2.3を使用）

### インストール

```bash
bun add nuqs
```

### Next.js App Router設定

**重要**: Next.js App Routerでは、ルートレイアウトに`NuqsAdapter`を追加する必要があります。

```typescript
// src/app/layout.tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app'
import type { ReactNode } from 'react'

export default function RootLayout({
  children,
}: {
  children: ReactNode
}) {
  return (
    <html>
      <body>
        <NuqsAdapter>{children}</NuqsAdapter>
      </body>
    </html>
  )
}
```

**注意**: `NuqsAdapter`はルートレイアウトにのみ追加します。ネストされたレイアウトには追加不要です。

---

## 採用箇所の徹底的な洗い出し

### 1. 公開ページ

#### 1.1 ブログ一覧ページ (`/blog`)

**採用理由**: 複数のフィルタ（カテゴリ、タグ、検索）とページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `category`: カテゴリスラッグ（文字列、オプション）
- `tag`: タグスラッグ（文字列、オプション）
- `search`: 検索キーワード（文字列、オプション）

**実装パターン**:

```typescript
// src/lib/nuqs/blog-parsers.ts
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server'

export const blogParsers = {
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
  tag: parseAsString,
  search: parseAsString,
}

export const blogSearchParamsCache = createSearchParamsCache(blogParsers)

// src/app/blog/page.tsx
import { blogSearchParamsCache } from '@/lib/nuqs/blog-parsers'
import type { SearchParams } from 'nuqs/server'
import { BlogFilters } from '@/components/public/BlogFilters'
import { BlogPosts } from '@/components/public/BlogPosts'
import { Pagination } from '@/components/public/Pagination'

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // ⚠️ Next.js 16では searchParams が Promise
  // ⚠️ parse() を呼び出すのを忘れないこと
  const { page, category, tag, search } = await blogSearchParamsCache.parse(searchParams)
  
  // データ取得（ISRキャッシュ）
  const { posts, totalPages } = await getBlogPosts({ page, category, tag, search })
  
  return (
    <div>
      <BlogFilters />
      <BlogPosts posts={posts} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  )
}

// src/components/public/BlogFilters.tsx
'use client'
import { useQueryStates } from 'nuqs'
import { blogParsers } from '@/lib/nuqs/blog-parsers'

export function BlogFilters() {
  const [filters, setFilters] = useQueryStates(blogParsers)
  
  // フィルタ変更時にURLを更新
  const handleCategoryChange = (categorySlug: string | null) => {
    setFilters({ category: categorySlug, page: 1 }) // カテゴリ変更時はページをリセット
  }
  
  const handleSearchChange = (searchQuery: string | null) => {
    setFilters({ search: searchQuery, page: 1 }) // 検索変更時はページをリセット
  }
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

**注意事項**:
- ISR（`revalidate: 300`）を使用しているため、Server Componentで`searchParams`から値を取得
- Client Componentでnuqsを使用してURLを更新
- フィルタ変更時はページ番号を1にリセット

#### 1.2 お知らせ一覧ページ (`/news`)

**採用理由**: ページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）

**実装パターン**:
```typescript
'use client'
import { useQueryState, parseAsInteger } from 'nuqs'

export function NewsPagination() {
  const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
  
  return (
    <div>
      {/* ページネーションUI */}
    </div>
  )
}
```

#### 1.3 スペース一覧ページ (`/spaces`)

**採用理由**: フィルタ機能（カテゴリ、料金範囲、設備など）をURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `category`: カテゴリ（文字列、オプション）
- `minPrice`: 最低料金（整数、オプション）
- `maxPrice`: 最高料金（整数、オプション）
- `facilities`: 設備（文字列配列、オプション）
- `sort`: ソート順（文字列、デフォルト: 'popular'）

**実装パターン**:
```typescript
'use client'
import { useQueryStates, parseAsInteger, parseAsString, parseAsArrayOf } from 'nuqs'

export function SpaceFilters() {
  const [filters, setFilters] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    category: parseAsString,
    minPrice: parseAsInteger,
    maxPrice: parseAsInteger,
    facilities: parseAsArrayOf(parseAsString),
    sort: parseAsString.withDefault('popular'),
  })
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

### 2. 管理画面

#### 2.1 予約管理 (`/admin/reservations`)

**採用理由**: フィルタ、ソート、検索、ページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `status`: ステータス（文字列、オプション: 'pending' | 'confirmed' | 'cancelled'）
- `spaceId`: スペースID（文字列、オプション）
- `startDate`: 開始日（日付文字列、オプション）
- `endDate`: 終了日（日付文字列、オプション）
- `search`: 検索キーワード（文字列、オプション）
- `sort`: ソート順（文字列、デフォルト: 'startTime-desc'）
- `view`: ビュー（文字列、デフォルト: 'list' | 'calendar'）

**実装パターン**:
```typescript
'use client'
import { useQueryStates, parseAsInteger, parseAsString, parseAsIsoDateTime } from 'nuqs'

export function ReservationFilters() {
  const [filters, setFilters] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    status: parseAsString,
    spaceId: parseAsString,
    startDate: parseAsIsoDateTime,
    endDate: parseAsIsoDateTime,
    search: parseAsString,
    sort: parseAsString.withDefault('startTime-desc'),
    view: parseAsString.withDefault('list'),
  })
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

#### 2.2 顧客管理 (`/admin/customers`)

**採用理由**: 検索、フィルタ、ソート、ページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `search`: 検索キーワード（文字列、オプション）
- `status`: ステータス（文字列、オプション: 'NEW' | 'REPEATER' | 'VIP' | 'INACTIVE' | 'BLACKLIST'）
- `isActive`: アクティブフラグ（真偽値、オプション）
- `sort`: ソート順（文字列、デフォルト: 'lastName-asc'）
- `sortOrder`: ソート方向（文字列、デフォルト: 'asc' | 'desc'）

**実装パターン**:
```typescript
'use client'
import { useQueryStates, parseAsInteger, parseAsString, parseAsBoolean } from 'nuqs'

export function CustomerFilters() {
  const [filters, setFilters] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    search: parseAsString,
    status: parseAsString,
    isActive: parseAsBoolean,
    sort: parseAsString.withDefault('lastName'),
    sortOrder: parseAsString.withDefault('asc'),
  })
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

#### 2.3 ブログ管理 (`/admin/blog`)

**採用理由**: フィルタ、ソート、検索、ページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `status`: 公開状態（文字列、オプション: 'all' | 'published' | 'draft' | 'unpublished'）
- `categoryId`: カテゴリID（文字列、オプション）
- `authorId`: 著者ID（文字列、オプション）
- `startDate`: 公開開始日（日付文字列、オプション）
- `endDate`: 公開終了日（日付文字列、オプション）
- `search`: 検索キーワード（文字列、オプション）
- `sort`: ソート順（文字列、デフォルト: 'publishedAt-desc'）

**実装パターン**:
```typescript
'use client'
import { useQueryStates, parseAsInteger, parseAsString, parseAsIsoDateTime } from 'nuqs'

export function BlogPostFilters() {
  const [filters, setFilters] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    status: parseAsString.withDefault('all'),
    categoryId: parseAsString,
    authorId: parseAsString,
    startDate: parseAsIsoDateTime,
    endDate: parseAsIsoDateTime,
    search: parseAsString,
    sort: parseAsString.withDefault('publishedAt-desc'),
  })
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

#### 2.4 スペース管理 (`/admin/spaces`)

**採用理由**: フィルタ、ソート、検索、ページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `isPublished`: 公開フラグ（真偽値、オプション）
- `search`: 検索キーワード（文字列、オプション）
- `sort`: ソート順（文字列、デフォルト: 'name-asc'）

**実装パターン**:
```typescript
'use client'
import { useQueryStates, parseAsInteger, parseAsString, parseAsBoolean } from 'nuqs'

export function SpaceListFilters() {
  const [filters, setFilters] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    isPublished: parseAsBoolean,
    search: parseAsString,
    sort: parseAsString.withDefault('name-asc'),
  })
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

#### 2.5 お問い合わせ管理 (`/admin/inquiries`)

**採用理由**: ステータスフィルタ、ソート、ページネーションをURLに同期させる必要がある。

**クエリパラメータ**:
- `page`: ページ番号（整数、デフォルト: 1）
- `status`: ステータス（文字列、オプション: 'pending' | 'in-progress' | 'resolved'）
- `sort`: ソート順（文字列、デフォルト: 'createdAt-desc'）

**実装パターン**:
```typescript
'use client'
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs'

export function InquiryFilters() {
  const [filters, setFilters] = useQueryStates({
    page: parseAsInteger.withDefault(1),
    status: parseAsString,
    sort: parseAsString.withDefault('createdAt-desc'),
  })
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

---

## 実装パターンとベストプラクティス

### 1. Server ComponentsとClient Componentsの分離

**原則**: Server Componentsでデータ取得、Client ComponentsでURL状態管理。パーサー定義を共有して型安全性を確保。

#### 1.1 パーサー定義の共有

```typescript
// src/lib/nuqs/blog-parsers.ts
import {
  createSearchParamsCache,
  parseAsInteger,
  parseAsString,
} from 'nuqs/server'
// 注意: Server Componentsで使用する場合は 'nuqs/server' からインポート

export const blogParsers = {
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
  tag: parseAsString,
  search: parseAsString,
}

// Server Components用のキャッシュ
export const blogSearchParamsCache = createSearchParamsCache(blogParsers)
```

#### 1.2 Server Componentでの使用

```typescript
// src/app/blog/page.tsx
import { blogSearchParamsCache } from '@/lib/nuqs/blog-parsers'
import type { SearchParams } from 'nuqs/server'

export default async function BlogPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>
}) {
  // ⚠️ Next.js 16では searchParams が Promise になっている
  // ⚠️ parse() を呼び出すのを忘れないこと
  const { page, category, tag, search } = await blogSearchParamsCache.parse(searchParams)
  
  // データ取得
  const { posts, totalPages } = await getBlogPosts({ page, category, tag, search })
  
  return (
    <div>
      <BlogFilters />
      <BlogPosts posts={posts} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  )
}

// ネストされたServer Componentでも型安全にアクセス可能
function BlogPosts({ posts }: { posts: BlogPost[] }) {
  const maxResults = blogSearchParamsCache.get('page')
  // または
  const allParams = blogSearchParamsCache.all()
  return <div>{/* ... */}</div>
}
```

#### 1.3 Client Componentでの使用

```typescript
// src/components/public/BlogFilters.tsx
'use client'
import { useQueryStates } from 'nuqs'
import { blogParsers } from '@/lib/nuqs/blog-parsers'

export function BlogFilters() {
  // Server Componentsと同じパーサー定義を使用
  const [filters, setFilters] = useQueryStates(blogParsers)
  
  // フィルタ変更時にURLを更新
  const handleCategoryChange = (categorySlug: string | null) => {
    setFilters({ category: categorySlug, page: 1 })
  }
  
  return (
    <div>
      {/* フィルタUI */}
    </div>
  )
}
```

**メリット**:
- Server ComponentsとClient Componentsで同じパーサー定義を使用
- 型安全性が保証される
- パーサー定義の重複を避けられる

### 2. パーサーの使用

**原則**: 型安全なパーサーを使用してクエリパラメータを型変換。

```typescript
import {
  parseAsInteger,
  parseAsString,
  parseAsBoolean,
  parseAsIsoDateTime,
  parseAsArrayOf,
} from 'nuqs'

// 整数
const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))

// 文字列
const [category, setCategory] = useQueryState('category', parseAsString)

// 真偽値
const [isPublished, setIsPublished] = useQueryState('isPublished', parseAsBoolean)

// 日時
const [startDate, setStartDate] = useQueryState('startDate', parseAsIsoDateTime)

// 配列
const [facilities, setFacilities] = useQueryState(
  'facilities',
  parseAsArrayOf(parseAsString)
)
```

### 3. useQueryStatesの使用

**原則**: 複数のクエリパラメータを同時に管理する場合は`useQueryStates`を使用。

```typescript
import { useQueryStates, parseAsInteger, parseAsString } from 'nuqs'

const [filters, setFilters] = useQueryStates({
  page: parseAsInteger.withDefault(1),
  category: parseAsString,
  tag: parseAsString,
  search: parseAsString,
})

// 個別に更新
setFilters({ category: 'event' })

// 複数同時に更新
setFilters({ category: 'event', page: 1 })

// クリア
setFilters({ category: null, tag: null })
```

### 4. デフォルト値の設定

**原則**: デフォルト値を持つパラメータは`.withDefault()`を使用。

```typescript
const [page, setPage] = useQueryState('page', parseAsInteger.withDefault(1))
const [sort, setSort] = useQueryState('sort', parseAsString.withDefault('popular'))
```

### 5. shallowオプションの使用

**原則**: サーバー再レンダリングを避ける場合は`shallow: true`を使用。

```typescript
const [filters, setFilters] = useQueryStates(
  {
    page: parseAsInteger.withDefault(1),
    category: parseAsString,
  },
  {
    shallow: true, // サーバー再レンダリングを避ける
  }
)
```

**注意**: ISRを使用している場合は、`shallow: true`を使用するとキャッシュが更新されないため、適切に判断する必要があります。

### 6. カスタムパーサーの作成

**原則**: 独自の型変換が必要な場合はカスタムパーサーを作成。

```typescript
import { createSearchParamsCache, parseAsString } from 'nuqs'

// カスタムパーサー: ソート順
const parseAsSortOrder = parseAsString.withDefault('asc').withOptions({
  validate: (value) => value === 'asc' || value === 'desc',
})

const [sortOrder, setSortOrder] = useQueryState('sortOrder', parseAsSortOrder)
```

---

## ISRとの整合性

### 問題点

ISR（Incremental Static Regeneration）を使用している場合、クエリパラメータが動的なため、すべての組み合わせを事前生成することは困難です。

### 解決策

#### 1. 主要な組み合わせを事前生成

```typescript
// src/app/blog/page.tsx
export async function generateStaticParams() {
  // 主要なカテゴリとタグの組み合わせを事前生成
  const categories = await prisma.blogCategory.findMany({
    select: { slug: true },
  })
  
  const tags = await prisma.blogTag.findMany({
    select: { slug: true },
  })
  
  const params = []
  
  // カテゴリのみ
  for (const category of categories) {
    params.push({ category: category.slug })
  }
  
  // タグのみ
  for (const tag of tags) {
    params.push({ tag: tag.slug })
  }
  
  return params
}
```

#### 2. 動的パラメータがある場合はSSRに切り替え

```typescript
// src/app/blog/page.tsx
export const dynamic = 'force-dynamic' // SSRに切り替え

export default async function BlogPage({
  searchParams,
}: {
  searchParams: { page?: string; category?: string; tag?: string; search?: string }
}) {
  // ...
}
```

#### 3. ハイブリッドアプローチ

```typescript
// Server Component: データ取得（ISR）
export default async function BlogPage({
  searchParams,
}: {
  searchParams: { page?: string; category?: string; tag?: string; search?: string }
}) {
  const page = parseInt(searchParams.page || '1', 10)
  const category = searchParams.category
  const tag = searchParams.tag
  const search = searchParams.search
  
  // 検索クエリがある場合はSSR、ない場合はISR
  const { posts, totalPages } = await getBlogPosts({ page, category, tag, search })
  
  return (
    <div>
      <BlogFilters />
      <BlogPosts posts={posts} />
      <Pagination currentPage={page} totalPages={totalPages} />
    </div>
  )
}

export const revalidate = searchParams.search ? 0 : 300 // 検索時はSSR、それ以外はISR
```

---

## キャッシュ戦略の調整

### クエリパラメータを含めたキャッシュキー

```typescript
// src/lib/blog.ts
import { unstable_cache } from 'next/cache'

export async function getBlogPosts(params: {
  page?: number
  category?: string
  tag?: string
  search?: string
}) {
  const cacheKey = [
    'blog-posts',
    params.page || 1,
    params.category || 'all',
    params.tag || 'all',
    params.search || '',
  ]
  
  return unstable_cache(
    async () => {
      // データ取得
    },
    cacheKey,
    {
      tags: ['blog-posts-list'],
      revalidate: 300,
    }
  )()
}
```

---

## 型定義の作成

### クエリパラメータの型定義

```typescript
// src/lib/nuqs/types.ts
import type { parseAsInteger, parseAsString, parseAsBoolean } from 'nuqs'

// ブログページのクエリパラメータ型
export type BlogPageSearchParams = {
  page?: number
  category?: string
  tag?: string
  search?: string
}

// 予約管理のクエリパラメータ型
export type ReservationPageSearchParams = {
  page?: number
  status?: 'pending' | 'confirmed' | 'cancelled'
  spaceId?: string
  startDate?: Date
  endDate?: Date
  search?: string
  sort?: string
  view?: 'list' | 'calendar'
}

// 顧客管理のクエリパラメータ型
export type CustomerPageSearchParams = {
  page?: number
  search?: string
  status?: 'NEW' | 'REPEATER' | 'VIP' | 'INACTIVE' | 'BLACKLIST'
  isActive?: boolean
  sort?: string
  sortOrder?: 'asc' | 'desc'
}
```

---

## 実装優先順位

### フェーズ1: 基盤整備（高優先度）

1. **nuqsパッケージのインストール**
   - `bun add nuqs`

2. **ルートレイアウトへのNuqsAdapter追加**
   - `src/app/layout.tsx`: `NuqsAdapter`を追加

3. **パーサー定義の作成（型定義を含む）**
   - `src/lib/nuqs/blog-parsers.ts`: ブログページ用パーサーとキャッシュ
   - `src/lib/nuqs/reservation-parsers.ts`: 予約管理用パーサーとキャッシュ
   - `src/lib/nuqs/customer-parsers.ts`: 顧客管理用パーサーとキャッシュ
   - `src/lib/nuqs/space-parsers.ts`: スペース管理用パーサーとキャッシュ
   - `src/lib/nuqs/inquiry-parsers.ts`: お問い合わせ管理用パーサーとキャッシュ

### フェーズ2: 公開ページへの適用（高優先度）

1. **ブログ一覧ページ (`/blog`)**
   - フィルタ、ページネーションの実装
   - ISRとの整合性確保

2. **お知らせ一覧ページ (`/news`)**
   - ページネーションの実装

3. **スペース一覧ページ (`/spaces`)**
   - フィルタ機能の実装

### フェーズ3: 管理画面への適用（中優先度）

1. **予約管理 (`/admin/reservations`)**
   - フィルタ、ソート、検索、ページネーションの実装

2. **顧客管理 (`/admin/customers`)**
   - 検索、フィルタ、ソート、ページネーションの実装

3. **ブログ管理 (`/admin/blog`)**
   - フィルタ、ソート、検索、ページネーションの実装

4. **スペース管理 (`/admin/spaces`)**
   - フィルタ、ソート、検索、ページネーションの実装

5. **お問い合わせ管理 (`/admin/inquiries`)**
   - ステータスフィルタ、ソート、ページネーションの実装

---

## 期待される効果

### 開発効率の向上

- **型安全性**: クエリパラメータの型エラーをコンパイル時に検出
- **コードの簡潔性**: `useState`ライクなAPIで直感的
- **保守性**: URL状態管理のロジックが一元化

### UXの向上

- **URL共有**: フィルタ状態をURLで共有可能
- **ブラウザ操作**: 戻る/進むボタンで状態を復元
- **ブックマーク**: 特定のフィルタ状態をブックマーク可能

---

## 重要な注意事項

### Next.js 16での変更点

1. **`searchParams`がPromise**: Next.js 16では`searchParams`が`Promise<SearchParams>`になっています。
   ```typescript
   // Next.js 15以前
   export default function Page({ searchParams }: { searchParams: { page?: string } }) {
     const page = searchParams.page
   }
   
   // Next.js 16
   export default async function Page({ searchParams }: { searchParams: Promise<SearchParams> }) {
     const { page } = await blogSearchParamsCache.parse(searchParams)
   }
   ```

2. **`createSearchParamsCache.parse()`で`await`が必要**: Server Componentsでは必ず`await`を使用します。

3. **`NuqsAdapter`の追加**: ルートレイアウトに`NuqsAdapter`を追加する必要があります。

### Server ComponentsとClient Componentsのパーサー共有

- Server Components用: `nuqs/server`からインポート（`'use client'`ディレクティブを避けるため）
- Client Components用: `nuqs`からインポート
- パーサー定義は同じファイルで共有可能

## 参考資料

### プロジェクトドキュメント

- [`FEATURE_REQUIREMENTS.md`](./FEATURE_REQUIREMENTS.md): 機能要件
- [`BLOG_REQUIREMENTS.md`](./BLOG_REQUIREMENTS.md): ブログ機能要件
- [`API.md`](./API.md): API仕様
- [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md): キャッシュ戦略
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md): ベストプラクティス

### 外部リソース

- [nuqs公式ドキュメント](https://nuqs.dev/)
- [nuqs GitHub](https://github.com/47ng/nuqs)
- [Next.js App Router - Search Params](https://nextjs.org/docs/app/api-reference/file-conventions/page#searchparams)
- [Context7 - nuqs](https://context7.com/47ng/nuqs): 最新の実装例とベストプラクティス

---

## 更新履歴

- **2026-01-06**: 初版作成、nuqs採用箇所の徹底的な洗い出しと実装要件を追加
