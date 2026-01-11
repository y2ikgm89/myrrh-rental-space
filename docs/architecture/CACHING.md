# キャッシング戦略ガイド

> **Note**: このドキュメントには、Next.js 16 App Routerの最新のキャッシングAPIに基づく詳細なキャッシング戦略が記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。

**最終更新**: 2026-01-08

## 実装方針

**後方互換性を考慮しないクリーンな実装**: このプロジェクトは、最新の公式ベストプラクティスに準拠したクリーンでモダンな実装を優先します。古いバージョンや非推奨APIとの後方互換性は維持しません。すべての実装は、フレームワークとライブラリの最新の安定版を使用し、レガシーな回避策なしに公式推奨事項に従う必要があります。

---

## 概要

Next.js 16 App Routerでは、複数のキャッシングAPIが提供されています。このドキュメントでは、各APIの使用方法と適切なキャッシング戦略を説明します。

---

## キャッシングAPI一覧

### 1. `fetch()`のキャッシュオプション

**用途**: 外部APIやデータベースクエリの結果をキャッシュ

```typescript
// 静的データ（ビルド時にキャッシュ、手動無効化まで有効）
const staticData = await fetch('https://api.example.com/data', {
  cache: 'force-cache', // デフォルト
})

// 動的データ（キャッシュしない、毎回取得）
const dynamicData = await fetch('https://api.example.com/data', {
  cache: 'no-store',
})

// ISR（時間ベースの再検証）
const revalidatedData = await fetch('https://api.example.com/data', {
  next: { revalidate: 60 }, // 60秒ごとに再検証
})
```

### 2. `unstable_cache`

**用途**: 関数結果をキャッシュ（タグベースの無効化に対応）

```typescript
import { unstable_cache } from 'next/cache'

export const getSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany({
      where: { isPublished: true },
    })
  },
  ['spaces'], // cache key
  {
    tags: ['spaces-list'],
    revalidate: 3600, // 1時間ごとに再検証
  }
)
```

### 3. `unstable_noStore`

**用途**: 特定のデータをキャッシュから明示的に除外

```typescript
import { unstable_noStore } from 'next/cache'

export async function getUserReservations(userId: string) {
  unstable_noStore() // このデータはキャッシュしない
  return await prisma.reservation.findMany({
    where: { userId },
  })
}
```

### 4. `revalidatePath`

**用途**: 特定のパスのキャッシュを無効化

```typescript
import { revalidatePath } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // 特定のパスのキャッシュを無効化
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
}
```

### 5. `revalidateTag`

**用途**: タグベースでキャッシュを無効化

```typescript
import { revalidateTag } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // タグベースでキャッシュを無効化（stale-while-revalidate semantics）
  revalidateTag('spaces-list', 'max')
}
```

**`profile`パラメータ**:
- `'max'`: stale-while-revalidate semantics（**推奨**）
  - 古いコンテンツを即座に表示し、バックグラウンドで新しいデータを取得
  - ユーザー体験が向上し、パフォーマンスも最適化される
  - 次のリクエストから新しいデータを表示
  - **動作の仕組み**:
    1. 古いコンテンツを即座に表示（キャッシュされたコンテンツ）
    2. バックグラウンドで新しいデータを取得
    3. 次のリクエストから新しいデータを表示
- 指定なし: 即座にキャッシュを無効化し、次のリクエストで新しいデータを取得（**非推奨、レガシー動作**）

**使用例**:

```typescript
// ✅ 推奨: stale-while-revalidate semantics
revalidateTag('spaces-list', 'max')

// ❌ 非推奨: レガシー動作（即座にキャッシュを無効化）
revalidateTag('spaces-list')
```

### 6. `updateTag`

**用途**: 即座にキャッシュを無効化（read-your-own-writesシナリオ）。Server Actionsでのみ使用可能。

```typescript
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createBlogPost(formData: FormData) {
  const post = await prisma.blogPost.create({
    data: {
      title: formData.get('title') as string,
      content: formData.get('content') as string,
      // ...
    },
  })

  // 即座にキャッシュを無効化（stale-while-revalidateなし）
  // 作成したばかりの投稿を即座に表示する必要があるため
  updateTag('blog-posts-list')
  updateTag(`blog-post-${post.id}`)

  redirect(`/blog/${post.slug}`)
}
```

**重要なポイント**:
- **Server Actionsでのみ使用可能**: Route Handlersでは使用できません
- **即座にキャッシュを無効化**: stale-while-revalidate semanticsなし
- **read-your-own-writesシナリオに最適**: データ作成後に即座にそのデータを表示する必要がある場合
- **`revalidateTag`との違い**: `revalidateTag`はstale-while-revalidate semanticsをサポートしますが、`updateTag`は即座に無効化します

**使用シナリオ**:
- データ作成後に即座にそのデータを表示する必要がある場合
- ユーザーが作成したコンテンツを即座に確認できるようにする場合
- stale-while-revalidateが不要な場合

### 7. `refresh`

**用途**: 現在のページのキャッシュを更新。ページリロードなしで最新データを表示できます。

```typescript
import { refresh } from 'next/cache'
import { revalidatePath, revalidateTag } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // 現在のページのキャッシュを更新
  refresh()
  
  // 関連するパスも無効化
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
  revalidateTag('spaces-list', 'max')
}
```

**重要なポイント**:
- **現在のページのみ**: 現在のページのキャッシュを更新します
- **ページリロードなし**: ページリロードなしで最新データを表示できます
- **`revalidatePath`と組み合わせ**: 関連するパスも無効化する場合は、`revalidatePath`と組み合わせて使用します

**使用シナリオ**:
- 現在のページのデータを更新した場合
- ページリロードなしで最新データを表示したい場合
- `revalidatePath`と組み合わせて使用

---

## キャッシュ階層の定義

> **Note**: キャッシュ階層の詳細な要件定義については、[`../plans/001-architecture-improvements.md`](./../plans/001-architecture-improvements.md)を参照してください。

キャッシュ戦略を4つの階層に分類します：

### L1: 静的コンテンツ (`revalidate: false`)

**用途**: プライバシーポリシー、利用規約など、変更頻度が極めて低いコンテンツ

**特徴**:
- ビルド時に生成
- 手動無効化まで有効
- パフォーマンスが最高

**実装例**:

```typescript
// src/app/privacy/page.tsx
export default async function PrivacyPage() {
  return <div>プライバシーポリシー</div>
}

// または明示的に
export const revalidate = false
```

### L2: ISR (`revalidate: <seconds>`)

**用途**: ブログ記事、お知らせ、スペース詳細など、定期的に更新されるコンテンツ

**特徴**:
- 時間ベースの再生成
- 指定した時間ごとに自動的に再検証
- バランスの取れたパフォーマンスと新鮮さ

**実装例**:

```typescript
// src/app/spaces/[id]/page.tsx
export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params // Next.js 16ではparamsはPromise

  const space = await prisma.space.findUnique({
    where: { id },
  })
  return <SpaceDetails space={space} />
}

export const revalidate = 3600 // 1時間ごとに再生成
```

### L3: タグベースキャッシュ (`unstable_cache` + `revalidateTag`)

**用途**: スペース一覧、ブログ一覧など、関連データが更新されたときに一括で無効化したいコンテンツ

**特徴**:
- タグベースの無効化に対応
- 関連データの更新時に一括で無効化可能
- 柔軟なキャッシュ管理

**実装例**:

```typescript
// src/lib/data.ts
import { unstable_cache } from 'next/cache'

export const getSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany({
      where: { isPublished: true },
    })
  },
  ['spaces'],
  {
    tags: ['spaces-list'],
    revalidate: 3600, // 1時間ごとに再検証
  }
)

// Server Actionで無効化
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({ where: { id }, data })
  revalidateTag('spaces-list', 'max') // stale-while-revalidate semantics
}
```

### L4: 動的コンテンツ (`unstable_noStore()`)

**用途**: 予約ページ、管理画面など、常に最新データが必要なコンテンツ

**特徴**:
- キャッシュしない
- 毎回最新データを取得
- リアルタイム性が最優先

**実装例**:

```typescript
// src/app/reservation/page.tsx
import { unstable_noStore } from 'next/cache'

export default async function ReservationPage() {
  unstable_noStore() // このデータはキャッシュしない
  
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
  })
  
  return <ReservationForm spaces={spaces} />
}
```

---

## stale-while-revalidate semantics

> **Note**: stale-while-revalidate semanticsの詳細な要件定義については、[`../plans/001-architecture-improvements.md`](./../plans/001-architecture-improvements.md)を参照してください。

`revalidateTag`の第2引数に`'max'`を指定することで、stale-while-revalidate semanticsが適用されます。

**重要**: Next.js 16では、`revalidateTag`の第2引数に`'max'`を指定することが**推奨**されています。第2引数を指定しない場合（レガシー動作）は非推奨です。

### 動作の仕組み

1. **古いコンテンツを即座に表示**: キャッシュされた古いコンテンツを即座にユーザーに表示
2. **バックグラウンドで更新**: 同時にバックグラウンドで新しいデータを取得
3. **次回リクエストで更新**: 次のリクエストから新しいデータを表示

**レガシー動作との違い**:

```typescript
// ✅ 推奨: stale-while-revalidate semantics
revalidateTag('spaces-list', 'max')
// 動作: 古いコンテンツを即座に表示 → バックグラウンドで更新 → 次回リクエストで新しいデータ

// ❌ 非推奨: レガシー動作（即座にキャッシュを無効化）
revalidateTag('spaces-list')
// 動作: 即座にキャッシュを無効化 → 次のリクエストで新しいデータを取得（ローディング時間が発生）
```

### 利点

- **ユーザー体験の向上**: ローディング時間を短縮し、即座にコンテンツを表示
- **パフォーマンスの最適化**: サーバー負荷を分散し、レスポンス時間を短縮
- **新鮮なデータの提供**: バックグラウンドで更新することで、常に最新のデータを提供

### 実装例

```typescript
// Server Actionでstale-while-revalidate semanticsを使用
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // stale-while-revalidate semantics
  // 古いコンテンツを即座に表示し、バックグラウンドで更新
  revalidateTag('spaces-list', 'max')
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
}
```

### 適用範囲

- スペース更新時
- ブログ記事更新時
- ナビゲーション更新時
- サイト設定更新時
- その他、コンテンツ更新時に即座に反映が必要な箇所

---

## キャッシング戦略

### 公開ページ

#### ホームページ (`/`)

```typescript
// src/app/page.tsx
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

const getSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany({
      where: { isPublished: true },
      select: {
        id: true,
        name: true,
        mainImageUrl: true,
        hourlyPrice: true,
      },
      take: 6,
      orderBy: { createdAt: 'desc' },
    })
  },
  ['home-spaces'],
  {
    tags: ['spaces-list'],
    revalidate: 3600, // 1時間ごとに再検証
  }
)

export default async function HomePage() {
  const spaces = await getSpaces()

  return (
    <div>
      <h1>レンタルスペース</h1>
      <SpaceList spaces={spaces} />
    </div>
  )
}

export const revalidate = 3600 // ISR: 1時間ごとに再生成
```

#### スペース詳細ページ (`/spaces/[id]`)

```typescript
// src/app/spaces/[id]/page.tsx
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

const getSpace = unstable_cache(
  async (id: string) => {
    return await prisma.space.findUnique({
      where: { id, isPublished: true },
      include: {
        reservations: {
          where: {
            startTime: { gte: new Date() },
            status: 'confirmed',
          },
          select: {
            startTime: true,
            endTime: true,
          },
        },
      },
    })
  },
  ['space'],
  {
    tags: ['spaces-list'],
    revalidate: 60, // 60秒ごとに再検証
  }
)

export async function generateStaticParams() {
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: { id: true },
  })

  return spaces.map(space => ({ id: space.id }))
}

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params // Next.js 16ではparamsはPromise

  const space = await getSpace(id)

  if (!space) {
    notFound()
  }

  return <SpaceDetails space={space} />
}

export const revalidate = 60 // ISR: 60秒ごとに再生成
```

#### ブログ一覧ページ (`/blog`)

```typescript
// src/app/blog/page.tsx
import { unstable_cache } from 'next/cache'
import { prisma } from '@/lib/prisma'

const getBlogPosts = unstable_cache(
  async (page: number = 1) => {
    const pageSize = 12
    const skip = (page - 1) * pageSize

    const [posts, total] = await Promise.all([
      prisma.blogPost.findMany({
        where: { isPublished: true },
        skip,
        take: pageSize,
        orderBy: { publishedAt: 'desc' },
        include: {
          category: true,
          tags: true,
        },
      }),
      prisma.blogPost.count({
        where: { isPublished: true },
      }),
    ])

    return {
      posts,
      total,
      totalPages: Math.ceil(total / pageSize),
    }
  },
  ['blog-posts'],
  {
    tags: ['blog-posts-list'],
    revalidate: 300, // 5分ごとに再検証
  }
)

export default async function BlogPage({
  searchParams,
}: {
  searchParams: { page?: string }
}) {
  const page = parseInt(searchParams.page || '1', 10)
  const { posts, totalPages } = await getBlogPosts(page)

  return (
    <div>
      <h1>Blog</h1>
      <BlogPostList posts={posts} totalPages={totalPages} />
    </div>
  )
}

export const revalidate = 300 // ISR: 5分ごとに再生成
```

### 管理画面

#### ダッシュボード (`/admin`)

```typescript
// src/app/admin/page.tsx
import { unstable_noStore } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { redirect } from 'next/navigation'

export default async function AdminDashboard() {
  // 管理画面は常に最新データを表示
  unstable_noStore()

  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/login')
  }

  const [spacesCount, reservationsCount, usersCount] = await Promise.all([
    prisma.space.count(),
    prisma.reservation.count(),
    prisma.user.count(),
  ])

  return (
    <div>
      <h1>ダッシュボード</h1>
      <Stats
        spaces={spacesCount}
        reservations={reservationsCount}
        users={usersCount}
      />
    </div>
  )
}
```

### Server Actionsでのキャッシュ無効化

```typescript
// src/actions/admin/spaces.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'

export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  const space = await prisma.space.create({ data })

  // パスベースの無効化
  revalidatePath('/spaces')
  revalidatePath('/')

  // タグベースの無効化（stale-while-revalidate semantics）
  revalidateTag('spaces-list', 'max')

  return { success: true, spaceId: space.id }
}

export async function updateSpace(id: string, data: UpdateSpaceData) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  await prisma.space.update({
    where: { id },
    data,
  })

  // 特定のスペースページを無効化
  revalidatePath(`/spaces/${id}`)
  revalidatePath('/spaces')
  revalidatePath('/')

  // タグベースの無効化（stale-while-revalidate semantics）
  revalidateTag('spaces-list', 'max')

  return { success: true }
}

export async function deleteSpace(id: string) {
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  await prisma.space.delete({
    where: { id },
  })

  // すべての関連パスを無効化
  revalidatePath('/spaces')
  revalidatePath('/')
  revalidateTag('spaces-list', 'max')

  return { success: true }
}
```

---

## キャッシングパターン

### パターン1: 静的コンテンツ（SSG）

```typescript
// ビルド時に生成、手動無効化まで有効
export default async function PrivacyPage() {
  return <div>プライバシーポリシー</div>
}

// または明示的に
export const revalidate = false
```

### パターン2: ISR（Incremental Static Regeneration）

```typescript
// 時間ベースの再生成
export default async function SpacesPage() {
  const spaces = await prisma.space.findMany()
  return <SpaceList spaces={spaces} />
}

export const revalidate = 3600 // 1時間ごとに再生成
```

### パターン3: 動的コンテンツ（SSR）

```typescript
// 毎回最新データを取得
import { unstable_noStore } from 'next/cache'

export default async function ReservationPage() {
  unstable_noStore() // キャッシュしない

  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
  })

  return <ReservationForm spaces={spaces} />
}
```

### パターン4: タグベースのキャッシング

```typescript
// データ取得関数
import { unstable_cache } from 'next/cache'

export const getSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany()
  },
  ['spaces'],
  {
    tags: ['spaces-list'],
    revalidate: 3600,
  }
)

// Server Actionで無効化
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({ where: { id }, data })
  revalidateTag('spaces-list', 'max') // タグベースで無効化（stale-while-revalidate semantics）
}
```

### パターン5: PPR（Partial Prerendering） / Cache Components

> **Note**: Next.js 16では、実験的なPPRフラグが削除され、`cacheComponents`設定で有効化されます。`"use cache"`ディレクティブを使用して、コンポーネントや関数レベルでキャッシュを明示的に制御できます。

**用途**: 静的コンテンツと動的コンテンツを同じルート内で組み合わせ、高速な初期ページロードを実現

**特徴**:
- 静的コンテンツは事前レンダリング
- 動的コンテンツはランタイムで取得
- `"use cache"`ディレクティブで明示的なキャッシュ制御
- デフォルトで15分間のサーバーサイド再検証期間

**設定**:

```typescript
// next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  cacheComponents: true, // PPR/Cache Componentsを有効化
}

export default nextConfig
```

**実装例**:

```typescript
// ページレベルでのキャッシュ
// app/blog/page.tsx
"use cache"

export default async function BlogPage() {
  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <div>
      {posts.map(post => (
        <Article key={post.id} {...post} />
      ))}
    </div>
  )
}
```

```typescript
// コンポーネントレベルでのキャッシュ
// components/UserProfile.tsx
"use cache"

async function UserProfile({ userId }: { userId: string }) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
  })
  return <div>{user?.name}</div>
}
```

```typescript
// 関数レベルでのキャッシュ
// lib/data.ts
export async function getPopularPosts() {
  "use cache"

  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: { views: 'desc' },
    take: 10,
  })

  return posts
}
```

**注意事項**:
- `"use cache"`を使用する関数やコンポーネントは、シリアライズ可能な値を返す必要があります
- レイアウトやページのトップレベルで使用すると、ルートセグメントが事前レンダリングされます
- ランタイムリクエストAPI（`cookies()`、`headers()`など）にアクセスする場合は、実験的な`'use cache: private'`ディレクティブを使用できます（ブラウザのメモリにのみキャッシュされ、ページリロード後は保持されません）

### パターン6: CSR（Client-Side Rendering）

> **Note**: Next.js 16では、デフォルトでServer Componentsを使用します。Client Componentsは`'use client'`ディレクティブで明示的に指定し、`dynamic`インポートで`ssr: false`を指定することで、完全にクライアントサイドのみでレンダリングできます。

**用途**: ブラウザAPIへのアクセス、インタラクティブなUI、クライアントサイドのみで実行する必要があるコンポーネント

**特徴**:
- クライアントサイドでのみ実行
- ブラウザAPI（`localStorage`、`navigator.geolocation`など）にアクセス可能
- 状態管理、エフェクト、イベントリスナーを使用可能
- サーバーサイドリソースに直接アクセス不可
- クライアント側のJavaScriptバンドルサイズが増加

**実装例**:

```typescript
// Client Component（デフォルトでサーバーサイドでも事前レンダリングされる）
// components/Counter.tsx
'use client'

import { useState } from 'react'

export default function Counter() {
  const [count, setCount] = useState(0)

  return (
    <div>
      <p>Counter {count}</p>
      <button onClick={() => setCount(count + 1)}>Increment</button>
      <button onClick={() => setCount(count - 1)}>Decrement</button>
    </div>
  )
}
```

```typescript
// 完全にクライアントサイドのみでレンダリング（SSRを無効化）
// components/ClientOnly.tsx
'use client'

import dynamic from 'next/dynamic'

// SSRを無効化してクライアントサイドのみで実行
const ClientOnlyApp = dynamic(
  () => import('./ClientOnlyApp'),
  { ssr: false }
)

export function ClientOnly() {
  return <ClientOnlyApp />
}
```

```typescript
// ブラウザAPIを使用するClient Component
// components/Geolocation.tsx
'use client'

import { useState, useEffect } from 'react'

export default function Geolocation() {
  const [location, setLocation] = useState<GeolocationCoordinates | null>(null)

  useEffect(() => {
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        setLocation(position.coords)
      })
    }
  }, [])

  if (!location) {
    return <div>位置情報を取得中...</div>
  }

  return (
    <div>
      <p>緯度: {location.latitude}</p>
      <p>経度: {location.longitude}</p>
    </div>
  )
}
```

**Server ComponentsとClient Componentsの組み合わせ**:

```typescript
// Server ComponentからClient Componentをレンダリング
// app/page.tsx
import Counter from '@/components/Counter'
import Geolocation from '@/components/Geolocation'

export default async function HomePage() {
  // Server Componentでデータ取得
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
  })

  return (
    <div>
      <h1>ホームページ</h1>
      {/* Server Componentで取得したデータを表示 */}
      <SpaceList spaces={spaces} />
      
      {/* Client Componentを組み合わせ */}
      <Counter />
      <Geolocation />
    </div>
  )
}
```

**ベストプラクティス**:
- `'use client'`境界は可能な限り深い位置に配置し、クライアント側JavaScriptバンドルサイズを最小化
- Server Componentsをデフォルトとして使用し、必要な場合のみClient Componentsを使用
- ブラウザAPIを使用する場合のみ`ssr: false`を指定
- Server ComponentsとClient Componentsを適切に組み合わせて、パフォーマンスとインタラクティビティのバランスを取る

---

## ベストプラクティス

### 1. 適切なキャッシュ戦略の選択

- **静的コンテンツ**: `revalidate: false` または `cache: 'force-cache'`（SSG）
- **半静的コンテンツ**: ISR（`revalidate: <seconds>`）
- **動的コンテンツ**: `unstable_noStore()` または `cache: 'no-store'`（SSR）
- **静的と動的の混合**: PPR/Cache Components（`cacheComponents: true` + `"use cache"`ディレクティブ）
- **クライアントサイドのみ**: CSR（`'use client'` + `dynamic`インポートで`ssr: false`）

### 2. タグベースの無効化の活用

```typescript
// ✅ 良い例: タグベースで関連データをグループ化
const getSpaces = unstable_cache(
  async () => { /* ... */ },
  ['spaces'],
  { tags: ['spaces-list'] }
)

const getBlogPosts = unstable_cache(
  async () => { /* ... */ },
  ['blog-posts'],
  { tags: ['blog-posts-list'] }
)

// 更新時に該当タグのみ無効化（stale-while-revalidate semantics）
revalidateTag('spaces-list', 'max') // spaces-listのみ無効化
```

### 3. パスベースの無効化の活用

```typescript
// ✅ 良い例: 更新時に関連するすべてのパスを無効化
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({ where: { id }, data })

  // 関連するすべてのパスを無効化
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
  revalidatePath('/') // ホームページにも表示される場合
}
```

### 4. 並列データフェッチング

```typescript
// ✅ 良い例: Promise.allで並列フェッチング
const [spaces, blogPosts, news] = await Promise.all([
  getSpaces(),
  getBlogPosts(),
  getNews(),
])
```

### 5. キャッシュキーの適切な設計

```typescript
// ✅ 良い例: パラメータを含むキャッシュキー
const getBlogPosts = unstable_cache(
  async (page: number, categoryId?: string) => {
    // ...
  },
  ['blog-posts', page, categoryId], // パラメータを含める
  {
    tags: ['blog-posts-list'],
    revalidate: 300,
  }
)
```

---

## セキュリティ考慮事項

> **Note**: セキュリティの詳細なポリシーとベストプラクティスについては、[`README.md`](./README.md)を参照してください。

### 機密情報のキャッシュ回避

**原則**: 認証状態に依存するデータや機密情報はキャッシュしない

```typescript
// ❌ 悪い例: ユーザー固有のデータをキャッシュ
const getUserReservations = unstable_cache(
  async (userId: string) => {
    return await prisma.reservation.findMany({
      where: { userId },
    })
  },
  ['reservations', userId], // ユーザーIDを含むキャッシュキー
  { tags: ['reservations-list'] }
)

// ✅ 良い例: ユーザー固有のデータはキャッシュしない
export async function getUserReservations(userId: string) {
  unstable_noStore() // ユーザー固有のデータはキャッシュしない
  return await prisma.reservation.findMany({
    where: { userId },
  })
}
```

### unstable_cache内での動的データソースへのアクセス

**原則**: `unstable_cache`内では動的データソース（`headers`、`cookies`など）にアクセスしない

```typescript
// ❌ 悪い例: unstable_cache内でheadersにアクセス
const getData = unstable_cache(
  async () => {
    const headersList = await headers() // 動的データソース
    const authHeader = headersList.get('authorization')
    // ...
  },
  ['data']
)

// ✅ 良い例: headersを外で取得して引数として渡す
export async function getData() {
  const headersList = await headers()
  const authHeader = headersList.get('authorization')
  
  return getCachedData(authHeader)
}

const getCachedData = unstable_cache(
  async (authHeader: string) => {
    // authHeaderを使用
  },
  ['data']
)
```

### 認証状態に依存するデータのキャッシュ

**原則**: 認証が必要なデータは`unstable_noStore()`を使用

```typescript
// ✅ 良い例: 認証が必要なデータはキャッシュしない
export default async function AdminDashboard() {
  unstable_noStore() // 管理画面は常に最新データを表示

  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    redirect('/login')
  }

  const stats = await prisma.space.count()
  return <Dashboard stats={stats} />
}
```

### キャッシュキーとタグのセキュリティ

**原則**: キャッシュキーやタグに予測可能な値や機密情報を含めない

```typescript
// ❌ 悪い例: ユーザーIDやセッション情報をキャッシュキーに含める
const getData = unstable_cache(
  async (userId: string, sessionToken: string) => {
    // ...
  },
  ['data', userId, sessionToken], // 機密情報を含む
  { tags: ['user-data'] }
)

// ✅ 良い例: 公開データのみをキャッシュ
const getSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany({
      where: { isPublished: true }, // 公開データのみ
    })
  },
  ['spaces'], // シンプルなキー
  { tags: ['spaces-list'] }
)
```

### キャッシュポイズニング対策

**原則**: ユーザー入力に基づくキャッシュキーは慎重に設計

```typescript
// ❌ 悪い例: ユーザー入力がそのままキャッシュキーになる
const getSearchResults = unstable_cache(
  async (searchQuery: string) => {
    // 検索クエリがそのままキャッシュキーになる
    return await search(searchQuery)
  },
  ['search', searchQuery], // 危険: 任意のクエリがキャッシュされる
  { tags: ['search-results'] }
)

// ✅ 良い例: 検索結果はキャッシュしない、または厳格に制限
export async function getSearchResults(searchQuery: string) {
  unstable_noStore() // 検索結果はキャッシュしない（リアルタイム性が重要）
  return await search(searchQuery)
}

// または、公開データのみをキャッシュ
const getPublicSpaces = unstable_cache(
  async (category?: string) => {
    // カテゴリは事前定義された値のみ許可
    const validCategories = ['office', 'event', 'studio']
    const categoryFilter = category && validCategories.includes(category)
      ? category
      : undefined

    return await prisma.space.findMany({
      where: {
        isPublished: true,
        category: categoryFilter,
      },
    })
  },
  ['spaces', category || 'all'], // 制限された値のみ
  { tags: ['spaces-list'] }
)
```

### セッション情報のキャッシュ回避

**原則**: セッション情報や認証トークンは絶対にキャッシュしない

```typescript
// ✅ 良い例: セッション情報は常に最新を取得
export async function getCurrentUser() {
  unstable_noStore() // セッション情報はキャッシュしない
  const session = await auth()
  return session?.user
}
```

### キャッシュ無効化のタイミング

**原則**: 認証状態が変更された場合は関連するキャッシュを無効化

```typescript
// ✅ 良い例: ログアウト時にキャッシュを無効化
export async function signOut() {
  await signOutAction()

  // ユーザー関連のキャッシュを無効化（必要に応じて）
  revalidateTag('user-data', 'max')
  revalidatePath('/')
}
```

### タグの命名規則

**原則**: タグ名は予測可能で、機密情報を含まない

```typescript
// ✅ 良い例: 明確で予測可能なタグ名
const getSpaces = unstable_cache(
  async () => { /* ... */ },
  ['spaces'],
  { tags: ['spaces-list', 'public-content'] } // 明確なタグ名
)

// ❌ 悪い例: 機密情報を含むタグ名
const getData = unstable_cache(
  async () => { /* ... */ },
  ['data'],
  { tags: ['user-123-data', 'session-abc'] } // 機密情報を含む
)
```

### キャッシュの分離

**原則**: 公開データと非公開データのキャッシュを分離

```typescript
// ✅ 良い例: 公開データと非公開データを分離
// 公開データ: キャッシュ可能
const getPublicSpaces = unstable_cache(
  async () => {
    return await prisma.space.findMany({
      where: { isPublished: true },
    })
  },
  ['spaces-public'],
  { tags: ['spaces-list', 'public-content'] }
)

// 非公開データ: キャッシュしない
export async function getAdminSpaces() {
  unstable_noStore() // 管理画面のデータはキャッシュしない
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  return await prisma.space.findMany()
}
```

### 開発環境での注意事項

**原則**: 開発環境ではキャッシュを無効化するか、慎重に使用

```typescript
// ✅ 良い例: 開発環境ではキャッシュを無効化
export async function getData() {
  if (process.env.NODE_ENV === 'development') {
    unstable_noStore() // 開発環境ではキャッシュしない
  }

  return await fetchData()
}
```

### セキュリティチェックリスト

キャッシング実装時のチェックリスト：

- [ ] 機密情報（ユーザーID、セッション情報、認証トークン）をキャッシュキーに含めていないか
- [ ] 認証状態に依存するデータは`unstable_noStore()`を使用しているか
- [ ] ユーザー固有のデータはキャッシュしていないか
- [ ] キャッシュタグに機密情報を含めていないか
- [ ] 検索結果など、ユーザー入力に基づくデータは適切に処理しているか
- [ ] 認証状態変更時にキャッシュを無効化しているか
- [ ] 公開データと非公開データのキャッシュを分離しているか

---

## トラブルシューティング

### キャッシュが無効化されない

**原因**: `revalidatePath`や`revalidateTag`が正しく呼ばれていない

**解決策**:
```typescript
// Server Actionで確実に無効化
export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({ where: { id }, data })
  
  // パスとタグの両方を無効化（stale-while-revalidate semantics）
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
  revalidateTag('spaces-list', 'max')
}
```

### 開発環境でキャッシュが残る

**原因**: Next.jsの開発モードでもキャッシュが有効

**解決策**:
```typescript
// 開発環境ではキャッシュを無効化
if (process.env.NODE_ENV === 'development') {
  unstable_noStore()
}
```

### キャッシュが大きくなりすぎる

**原因**: キャッシュするデータ量が多すぎる

**解決策**:
```typescript
// selectで必要なフィールドのみ取得
const spaces = await prisma.space.findMany({
  select: {
    id: true,
    name: true,
    mainImageUrl: true,
    // 必要なフィールドのみ
  },
})
```

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書
- [`BEST_PRACTICES.md`](./BEST_PRACTICES.md) - ベストプラクティスガイド
- [`README.md`](./README.md) - セキュリティポリシー
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`../plans/001-architecture-improvements.md`](./../plans/001-architecture-improvements.md) - アーキテクチャ改善要件定義

### 外部リソース

- [Next.js 16 Caching Documentation](https://nextjs.org/docs/app/building-your-application/caching)
- [Next.js Data Fetching](https://nextjs.org/docs/app/building-your-application/data-fetching)

---

## 更新履歴

- **2026-01-08**: Context7で取得した最新情報に基づき、以下の更新を実施
  - `revalidateTag`の`profile`パラメータ（`'max'`）の詳細な説明を追加（stale-while-revalidate semanticsの動作の仕組み、レガシー動作との違い）
  - `updateTag`の詳細な説明を追加（read-your-own-writesシナリオ、Server Actionsでのみ使用可能、`revalidateTag`との違い）
  - `refresh`の詳細な説明を追加（現在のページのキャッシュ更新、`revalidatePath`との組み合わせ）
  - stale-while-revalidate semanticsの説明を強化（動作の仕組み、レガシー動作との違いを明確化）
- **2026-01-08**: Next.js 16の非同期paramsパターンに全コード例を修正（`Promise<{ id: string }>`形式、`await params`使用）
- **2026-01-07**: PPR（Partial Prerendering）/ Cache ComponentsとCSR（Client-Side Rendering）の詳細な説明を追加、Next.js 16の最新機能を反映
- **2026-01-06**: セキュリティ考慮事項セクション追加、機密情報のキャッシュ回避、キャッシュポイズニング対策を追加
- **2026-01-06**: 初版作成、Next.js 16の最新キャッシングAPIを反映
