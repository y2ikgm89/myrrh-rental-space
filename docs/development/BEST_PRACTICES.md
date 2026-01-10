# ベストプラクティスガイド

> **Note**: このドキュメントには、Next.js 16、React 19、Prisma 7、Auth.js 5の最新の公式推奨に基づくベストプラクティスが記載されています。技術スタックの詳細については、[`CLAUDE.md`](../CLAUDE.md)を参照してください。

**最終更新**: 2026-01-08

---

## 概要

このドキュメントは、レンタルスペース管理システムで使用する技術スタックの最新の公式推奨に基づく実装ガイドラインです。後方互換性を考慮せず、最新のクリーンな実装を目指します。

---

## Next.js 16 App Router ベストプラクティス

### Proxy（ルート保護）ベストプラクティス

**原則**: Next.js 16 では `middleware.ts` ではなく `proxy.ts` を使用し、エクスポート名は `proxy` に統一します。`proxy` は **nodejs runtime 専用** で、Edge Runtime は使えません。

```typescript
// ✅ 良い例: proxy.ts で auth() ラッパーを使う
// src/proxy.ts
import { NextResponse } from 'next/server'
import { auth } from '@/lib/auth'

export const proxy = auth((req) => {
  const { pathname } = req.nextUrl
  const session = req.auth

  if (pathname.startsWith('/admin')) {
    if (pathname === '/admin/login') {
      return NextResponse.next()
    }

    if (!session) {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }

    if (session.user.role !== 'ADMIN') {
      return NextResponse.redirect(new URL('/admin/login', req.url))
    }
  }

  return NextResponse.next()
})

export const config = {
  matcher: ['/admin/:path*'],
}
```

### Server Components優先アーキテクチャ

**原則**: デフォルトでServer Componentsを使用し、必要な場合のみClient Componentsを使用します。

```typescript
// ✅ 良い例: Server Component（デフォルト）
// src/app/spaces/page.tsx
import { prisma } from '@/lib/prisma'

export default async function SpacesPage() {
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: {
      id: true,
      name: true,
      mainImageUrl: true,
      hourlyPrice: true,
    },
  })

  return (
    <div>
      {spaces.map(space => (
        <SpaceCard key={space.id} space={space} />
      ))}
    </div>
  )
}

// ✅ 良い例: Client Component（インタラクティブ要素のみ）
// src/components/public/ReservationForm.tsx
'use client'

import { useState } from 'react'
import { createReservation } from '@/actions/reservation'

export function ReservationForm({ spaceId }: { spaceId: string }) {
  const [isSubmitting, setIsSubmitting] = useState(false)

  async function handleSubmit(formData: FormData) {
    setIsSubmitting(true)
    await createReservation(formData)
    setIsSubmitting(false)
  }

  return (
    <form action={handleSubmit}>
      {/* フォーム内容 */}
    </form>
  )
}
```

### Server Actionsのベストプラクティス

**原則**: フォーム送信とデータ変更はServer Actionsを使用します。

```typescript
// ✅ 良い例: Server Action with revalidation
// src/actions/admin/spaces.ts
'use server'

import { revalidatePath, revalidateTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSpaceSchema } from '@/lib/validations/space'

export async function createSpace(formData: FormData) {
  // 1. 認証チェック
  const session = await auth()
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  // 2. バリデーション
  const data = createSpaceSchema.parse({
    name: formData.get('name'),
    description: formData.get('description'),
    // ...
  })

  // 3. データベース操作
  const space = await prisma.space.create({
    data,
  })

  // 4. キャッシュ無効化
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${space.id}`)
  revalidateTag('spaces-list', 'max') // stale-while-revalidate semantics

  return { success: true, spaceId: space.id }
}
```

### キャッシング戦略

詳細は [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) を参照してください。

#### unstable_cacheの使用

```typescript
// ✅ 良い例: 関数結果のキャッシュ
// src/lib/data.ts
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

**注意**: `unstable_cache`内では動的データソース（`headers`、`cookies`など）にアクセスしないでください。必要な場合は、関数の外で取得して引数として渡します。

```typescript
// ❌ 悪い例: unstable_cache内でheadersにアクセス
const getData = unstable_cache(
  async () => {
    const headersList = await headers() // 動的データソース
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

#### unstable_noStoreの使用

```typescript
// ✅ 良い例: 動的データのキャッシュ無効化
// src/lib/data.ts
import { unstable_noStore } from 'next/cache'

export async function getUserReservations(userId: string) {
  unstable_noStore() // このデータはキャッシュしない
  return await prisma.reservation.findMany({
    where: { userId },
  })
}
```

#### revalidateTagのprofileパラメータ（stale-while-revalidate semantics）

Next.js 16では、`revalidateTag`の第2引数に`'max'`を指定することで、stale-while-revalidate semanticsが適用されます。古いコンテンツを即座に表示し、バックグラウンドで新しいデータを取得することで、ユーザー体験とパフォーマンスの両立を実現します。

```typescript
// ✅ 推奨: stale-while-revalidate semantics（推奨）
// src/actions/admin/spaces.ts
'use server'

import { revalidateTag } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // 古いコンテンツを即座に表示し、バックグラウンドで更新
  revalidateTag('spaces-list', 'max')
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)
}

// ❌ 非推奨: 即座にキャッシュを無効化（レガシー動作）
// revalidateTag('spaces-list') // 第2引数なしは非推奨
```

**動作の仕組み**:
1. **古いコンテンツを即座に表示**: キャッシュされた古いコンテンツを即座にユーザーに表示
2. **バックグラウンドで更新**: 同時にバックグラウンドで新しいデータを取得
3. **次回リクエストで更新**: 次のリクエストから新しいデータを表示

**利点**:
- **ユーザー体験の向上**: ローディング時間を短縮し、即座にコンテンツを表示
- **パフォーマンスの最適化**: サーバー負荷を分散し、レスポンス時間を短縮
- **新鮮なデータの提供**: バックグラウンドで更新することで、常に最新のデータを提供

#### updateTagの使用（read-your-own-writesシナリオ）

`updateTag`は、Server Actionsでのみ使用可能で、即座にキャッシュを無効化します（stale-while-revalidateなし）。read-your-own-writesシナリオに最適です。

```typescript
// ✅ 良い例: read-your-own-writesシナリオ
// src/actions/admin/blog.ts
'use server'

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

**使用シナリオ**:
- データ作成後に即座にそのデータを表示する必要がある場合
- ユーザーが作成したコンテンツを即座に確認できるようにする場合
- stale-while-revalidateが不要な場合

**注意**: `updateTag`はServer Actionsでのみ使用可能です。Route Handlersでは使用できません。

#### refreshの使用（現在のページのキャッシュ更新）

`refresh`は、現在のページのキャッシュを更新します。ページリロードなしで最新データを表示できます。

```typescript
// ✅ 良い例: 現在のページのキャッシュを更新
// src/actions/admin/spaces.ts
'use server'

import { refresh } from 'next/cache'

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

**使用シナリオ**:
- 現在のページのデータを更新した場合
- ページリロードなしで最新データを表示したい場合
- `revalidatePath`と組み合わせて使用

#### fetch()のキャッシュオプション

```typescript
// ✅ 良い例: fetch()のキャッシュ制御
export default async function Page() {
  // 静的データ（キャッシュ）
  const staticData = await fetch('https://api.example.com/data', {
    cache: 'force-cache', // デフォルト
  })

  // 動的データ（キャッシュしない）
  const dynamicData = await fetch('https://api.example.com/data', {
    cache: 'no-store',
  })

  // ISR（時間ベースの再検証）
  const revalidatedData = await fetch('https://api.example.com/data', {
    next: { revalidate: 60 }, // 60秒ごとに再検証
  })

  return <div>...</div>
}
```

### generateStaticParamsの使用

```typescript
// ✅ 良い例: 動的ルートの事前生成
// src/app/spaces/[id]/page.tsx
export async function generateStaticParams() {
  const spaces = await prisma.space.findMany({
    where: { isPublished: true },
    select: { id: true },
  })

  return spaces.map(space => ({
    id: space.id,
  }))
}

export default async function SpacePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params // Next.js 16ではparamsはPromise

  const space = await prisma.space.findUnique({
    where: { id },
  })

  if (!space) {
    notFound()
  }

  return <SpaceDetails space={space} />
}
```

---

## React 19 ベストプラクティス

### Server Componentsでのデータフェッチング

**原則**: Server Componentsでは`await`を直接使用してデータを取得します。

```typescript
// ✅ 良い例: Server Componentでの直接データフェッチング
// src/app/blog/[slug]/page.tsx
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

export default async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params // Next.js 16ではparamsはPromise

  // Server Componentでは直接awaitを使用
  const post = await prisma.blogPost.findUnique({
    where: { slug, isPublished: true },
    include: {
      category: true,
      tags: true,
      author: {
        select: {
          id: true,
          name: true,
        },
      },
    },
  })

  if (!post) {
    notFound()
  }

  return (
    <article>
      <h1>{post.title}</h1>
      <BlogContent content={post.content} />
    </article>
  )
}
```

### Suspenseの活用

#### 粒度の細かいSuspense境界

ページ全体ではなく、データフェッチング単位でSuspense境界を設定します。各データフェッチングに適切なfallback UIを提供し、並列データフェッチングを`Promise.all`と組み合わせます。

```typescript
// ✅ 良い例: データフェッチング単位でのSuspense境界
// src/app/blog/page.tsx
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'

async function BlogPosts() {
  const posts = await prisma.blogPost.findMany({
    where: { isPublished: true },
    orderBy: { publishedAt: 'desc' },
  })

  return (
    <div>
      {posts.map(post => (
        <BlogCard key={post.id} post={post} />
      ))}
    </div>
  )
}

export default function BlogPage() {
  return (
    <div>
      <h1>Blog</h1>
      <Suspense fallback={<BlogPostsSkeleton />}>
        <BlogPosts />
      </Suspense>
    </div>
  )
}
```

#### 複数のSuspense境界の使用

複数のデータフェッチングがある場合は、それぞれにSuspense境界を設定します。

```typescript
// ✅ 良い例: 複数のSuspense境界
export default async function DashboardPage() {
  return (
    <div>
      <h1>ダッシュボード</h1>
      <Suspense fallback={<StatsSkeleton />}>
        <Stats />
      </Suspense>
      <Suspense fallback={<ReservationsSkeleton />}>
        <RecentReservations />
      </Suspense>
      <Suspense fallback={<UsersSkeleton />}>
        <RecentUsers />
      </Suspense>
    </div>
  )
}
```

#### Streaming SSRの最適化

重要でないデータは後からストリーミングし、重要なデータ（メタデータ、基本情報）は優先的にレンダリングします。

**ストリーミングの優先順位**:
- **最優先**: ページの基本構造、メタデータ
- **高優先**: 主要コンテンツ
- **中優先**: 補助的なコンテンツ
- **低優先**: 統計情報、関連コンテンツ

### Promiseを直接Client Componentに渡すパターン

React 19では、Server ComponentでPromiseを作成し、それを直接Client Componentに渡して`use()`で解決できます。これにより、重要でないデータの遅延読み込みが可能になり、パフォーマンスが向上します。

**適用範囲**:
- ブログ記事のコメント表示
- 予約ページの空き状況表示
- 管理画面の統計情報表示
- その他、重要でないデータの遅延読み込みが必要な箇所

```typescript
// ✅ 良い例: Promiseを直接渡してClient Componentでawait
// src/app/blog/[slug]/page.tsx
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'

async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params // Next.js 16ではparamsはPromise

  // 重要なデータはawaitで取得
  const post = await prisma.blogPost.findUnique({
    where: { slug, isPublished: true },
  })

  if (!post) {
    notFound()
  }

  // Promiseを直接渡す（Client Componentでawait）
  const commentsPromise = prisma.comment.findMany({
    where: { postId: post.id },
  })

  return (
    <article>
      <h1>{post.title}</h1>
      <BlogContent content={post.content} />
      <Suspense fallback={<CommentsLoading />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </article>
  )
}

// Client Component
'use client'
import { use } from 'react'

function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  const comments = use(commentsPromise)
  return (
    <div>
      {comments.map(comment => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  )
}
```

**ベストプラクティス**:
- 重要なデータは`await`で取得し、重要でないデータはPromiseとして渡す
- Suspenseと組み合わせてローディング状態を管理
- エラーハンドリングを適切に実装（Error Boundaryと組み合わせる）

**エラーハンドリング**:

`use()`フックはPromiseがrejectされた場合にエラーをthrowしますが、`try/catch`ではキャッチできません（`use()`はsuspendするため）。代わりに、Error Boundaryと組み合わせてエラーハンドリングを行います。

```typescript
// ✅ 良い例: Error Boundaryと組み合わせたエラーハンドリング
// src/app/blog/[slug]/page.tsx
import { Suspense } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  const post = await prisma.blogPost.findUnique({ where: { slug } })
  
  if (!post) {
    notFound()
  }
  
  const commentsPromise = prisma.comment.findMany({ 
    where: { postId: post.id } 
  })
  
  return (
    <article>
      <h1>{post.title}</h1>
      <BlogContent content={post.content} />
      <ErrorBoundary fallback={<CommentsError />}>
        <Suspense fallback={<CommentsLoading />}>
          <Comments commentsPromise={commentsPromise} />
        </Suspense>
      </ErrorBoundary>
    </article>
  )
}

// ❌ 悪い例: try/catchではキャッチできない
function Comments({ commentsPromise }: { commentsPromise: Promise<Comment[]> }) {
  try {
    const comments = use(commentsPromise) // エラーが発生してもcatchブロックに到達しない
    return <div>{/* ... */}</div>
  } catch (error) {
    return <div>Failed to load</div> // 到達しない
  }
}
```

### Client Componentsの最小化

**原則**: インタラクティブ要素のみをClient Componentsにします。

```typescript
// ✅ 良い例: インタラクティブ要素のみをClient Componentに
// src/components/public/ReservationForm.tsx
'use client'

import { useState, useTransition } from 'react'
import { createReservation } from '@/actions/reservation'

export function ReservationForm({ spaceId }: { spaceId: string }) {
  const [isPending, startTransition] = useTransition()

  async function handleSubmit(formData: FormData) {
    startTransition(async () => {
      await createReservation(formData)
    })
  }

  return (
    <form action={handleSubmit}>
      {/* フォーム内容 */}
      <button type="submit" disabled={isPending}>
        {isPending ? '送信中...' : '予約する'}
      </button>
    </form>
  )
}
```

---

## エラーバウンダリの実装

> **Note**: エラーバウンダリの詳細な要件定義については、[`ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md)を参照してください。

### 階層的なエラーバウンダリ

エラーバウンダリを階層的に実装します：

- **ルートレベル**: アプリケーション全体のエラー（`app/error.tsx`）
- **ページレベル**: ページ固有のエラー（`app/[route]/error.tsx`）
- **コンポーネントレベル**: コンポーネント固有のエラー（必要に応じて）

```typescript
// ✅ 良い例: ルートレベルのエラーバウンダリ
// app/error.tsx
'use client'
import { useEffect } from 'react'
import { ErrorBoundary } from '@/components/ErrorBoundary'

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーログを記録
    console.error('Root error:', error)
    // エラートラッキングサービスに送信（Sentryなど）
  }, [error])

  return <ErrorBoundary error={error} reset={reset} />
}

// ✅ 良い例: ページレベルのエラーバウンダリ
// app/blog/[slug]/error.tsx
'use client'
import { useEffect } from 'react'
import { BlogPostErrorBoundary } from '@/components/blog/BlogPostErrorBoundary'

export default function BlogPostError({
  error,
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  useEffect(() => {
    // エラーログを記録
    console.error('Blog post error:', error)
  }, [error])

  return <BlogPostErrorBoundary error={error} reset={reset} />
}
```

### エラーハンドリングの統一

Server Actionsでのエラーハンドリングを統一し、エラーレスポンス形式を標準化します。判別可能なユニオン型とエラーコードを使用して型安全性を確保します。

```typescript
// ✅ 良い例: 統一されたエラーハンドリング
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createSpace(
  formData: FormData
): Promise<Result<{ id: string }>> {
  try {
    // バリデーション
    const data = createSpaceSchema.parse({
      name: formData.get('name'),
      // ...
    })

    // データベース操作
    const space = await prisma.space.create({ data })

    // キャッシュ無効化
    revalidatePath('/spaces')

    return { success: true, data: { id: space.id } }
  } catch (error) {
    // エラータイプに応じた処理
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
          code: 'CONFLICT',
        }
      }
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Record not found',
          code: 'NOT_FOUND',
        }
      }
    }

    // 予期しないエラー
    console.error('Unexpected error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    }
  }
}
```

---

## Prisma 7 ベストプラクティス

### Driver Adaptersの設定（Prisma 7必須）

Prisma 7では、データベース接続にdriver adaptersが必須です。PostgreSQLの場合は`@prisma/adapter-pg`を使用し、接続プーリングはNode.js driver（`pg`）で管理します。

```typescript
// ✅ 良い例: Prisma 7のdriver adapter設定
// src/lib/prisma.ts
import { PrismaPg } from '@prisma/adapter-pg'
import { PrismaClient } from '@/generated/prisma/client'
import { Pool } from 'pg'

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  // 接続プーリングの設定
  max: 20, // 最大接続数
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})

const adapter = new PrismaPg(pool)

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
  })

if (process.env.NODE_ENV !== 'production') globalForPrisma.prisma = prisma
```

**重要なポイント**:
- **Driver adaptersは必須**: Prisma 7では、データベース接続にdriver adaptersが必須です
- **接続プーリング**: Node.js driver（`pg`）で接続プーリングを管理します
- **パフォーマンス**: driver adaptersにより、パフォーマンスと開発者体験が向上します
- **Supabase接続**: Supabaseの接続プーリングURLを使用する場合は、`Pool`の設定を調整します

**Supabase接続プーリングURLの使用**:

```typescript
// Supabase接続プーリングURLを使用する場合
const pool = new Pool({
  connectionString: process.env.DATABASE_URL, // 接続プーリングURL
  max: 20,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 2000,
})
```

詳細は [`PRISMA_7.md`](./PRISMA_7.md) を参照してください。

### selectで必要なフィールドのみ取得

```typescript
// ✅ 良い例: 必要なフィールドのみ取得
const spaces = await prisma.space.findMany({
  select: {
    id: true,
    name: true,
    mainImageUrl: true,
    hourlyPrice: true,
  },
})

// ❌ 悪い例: すべてのフィールドを取得
const spaces = await prisma.space.findMany()
```

### includeでN+1問題を回避

```typescript
// ✅ 良い例: includeで関連データも一度に取得
const reservations = await prisma.reservation.findMany({
  include: {
    space: {
      select: {
        id: true,
        name: true,
        mainImageUrl: true,
      },
    },
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
})

// ❌ 悪い例: N+1問題が発生
const reservations = await prisma.reservation.findMany()
for (const reservation of reservations) {
  const space = await prisma.space.findUnique({
    where: { id: reservation.spaceId },
  })
}
```

### inフィルターでN+1問題を回避

`include`が使えない場合や、より細かい制御が必要な場合は`in`フィルターを使用します。

```typescript
// ✅ 良い例: inフィルターでN+1問題を回避
const users = await prisma.user.findMany({})
const userIds = users.map((x) => x.id)

const posts = await prisma.post.findMany({
  where: {
    authorId: {
      in: userIds,
    },
  },
})

// これにより、2つのクエリで済みます（N+1問題を回避）
```

### インデックスの適切な使用

```prisma
// ✅ 良い例: 頻繁にクエリされるフィールドにインデックス
model Reservation {
  id        String   @id @default(uuid())
  spaceId   String
  startTime DateTime
  endTime   DateTime
  status    String

  @@index([spaceId, startTime, endTime]) // 複合インデックス
  @@index([status, startTime])
}
```

### ページネーションの実装

**URLクエリパラメータ管理**: フィルタ、ソート、ページネーションの状態管理については、[`NUQS_REQUIREMENTS.md`](./NUQS_REQUIREMENTS.md)を参照してください。

```typescript
// ✅ 良い例: 効率的なページネーション
const page = 1
const pageSize = 12

const [spaces, total] = await Promise.all([
  prisma.space.findMany({
    where: { isPublished: true },
    skip: (page - 1) * pageSize,
    take: pageSize,
    orderBy: { createdAt: 'desc' },
  }),
  prisma.space.count({
    where: { isPublished: true },
  }),
])

const totalPages = Math.ceil(total / pageSize)
```

### トランザクションの使用

```typescript
// ✅ 良い例: トランザクションで複数の操作を保証
await prisma.$transaction(async (tx) => {
  const space = await tx.space.create({
    data: spaceData,
  })

  await tx.reservation.create({
    data: {
      spaceId: space.id,
      // ...
    },
  })

  return space
})
```

---

## Auth.js 5 ベストプラクティス

### Prisma Adapterの設定

**重要**: Prisma 7では、`@/generated/prisma/client`からPrismaClientをインポートします。

```typescript
// ✅ 良い例: Auth.js 5の設定（Prisma 7対応）
// src/lib/auth.ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { PrismaClient } from '@/generated/prisma/client'
import { prisma } from '@/lib/prisma'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  ...authConfig,
})
```

**重要なポイント**:
- **Prisma 7対応**: `@/generated/prisma/client`からPrismaClientをインポート
- **JWTセッション推奨**: パフォーマンス向上のため、JWTセッション戦略を推奨
- **Prisma Adapter**: `@auth/prisma-adapter`を使用（`@next-auth/prisma-adapter`は非推奨）

### JWTセッション戦略

```typescript
// ✅ 良い例: JWTセッション設定
export const authOptions = {
  session: {
    strategy: 'jwt',
    maxAge: 30 * 24 * 60 * 60, // 30日
    updateAge: 24 * 60 * 60, // 24時間ごとに更新
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role
      }
      return token
    },
    async session({ session, token }) {
      if (token) {
        session.user.role = token.role
      }
      return session
    },
  },
}
```

### Server Actionsでの認証チェック

```typescript
// ✅ 良い例: Server Actionでの認証チェック
'use server'

import { auth } from '@/lib/auth'

export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  // ... 実装
}
```

---

## エラーハンドリング

### Server Actionsでのエラーハンドリング

Server Actionsでは判別可能なユニオン型を使用して型安全性を確保し、エラーコードを含む統一されたエラーレスポンス形式を使用します。

```typescript
// ✅ 良い例: 統一されたエラーハンドリング
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'

type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createSpace(
  formData: FormData
): Promise<Result<{ id: string }>> {
  try {
    // バリデーション
    const data = createSpaceSchema.parse({
      name: formData.get('name'),
      // ...
    })

    // データベース操作
    const space = await prisma.space.create({ data })

    // キャッシュ無効化
    revalidatePath('/spaces')

    return { success: true, data: { id: space.id } }
  } catch (error) {
    // Zodバリデーションエラー
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }

    // Prismaエラー
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
          code: 'CONFLICT',
        }
      }
      if (error.code === 'P2025') {
        return {
          success: false,
          error: 'Record not found',
          code: 'NOT_FOUND',
        }
      }
    }

    // 予期しないエラー
    console.error('Unexpected error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'INTERNAL_ERROR',
    }
  }
}
```

**使用例**:

```typescript
// 通常の呼び出し
const result = await createSpace(formData)
if (result.success) {
  // result.dataの型が自動的に絞り込まれる
  console.log('Created space:', result.data.id)
} else {
  // result.errorとresult.codeの型が自動的に絞り込まれる
  console.error('Error:', result.error, result.code)
  // エラーコードに応じた処理
  if (result.code === 'VALIDATION_ERROR') {
    // バリデーションエラーの処理
  }
}
```

**useActionStateとの統合**:

Next.js公式の`useActionState`フックを使用する場合、Server Actionのシグネチャを調整する必要があります：

```typescript
'use client'
import { useActionState } from 'react'
import { createSpace } from '@/actions/space'

const initialState = { success: false as const }

export function SpaceForm() {
  const [state, formAction, pending] = useActionState(createSpace, initialState)
  
  return (
    <form action={formAction}>
      {/* フォームフィールド */}
      {!state.success && state.error && (
        <p aria-live="polite">{state.error}</p>
      )}
      {state.success && (
        <p>Space created: {state.data.id}</p>
      )}
      <button disabled={pending}>Create</button>
    </form>
  )
}
```

**注意**: `useActionState`を使用する場合、Server Actionは`(prevState: any, formData: FormData) => Promise<Result<T>>`のシグネチャを持つ必要があります。統一形式の`Result<T>`型は`useActionState`と互換性があります。

### Route Handlersでのエラーハンドリング

```typescript
// ✅ 良い例: Route Handlerでのエラーハンドリング
// src/app/api/spaces/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export async function GET(request: NextRequest) {
  try {
    const spaces = await prisma.space.findMany({
      where: { isPublished: true },
    })

    return NextResponse.json({ spaces })
  } catch (error) {
    console.error('Error fetching spaces:', error)
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

---

## パフォーマンス最適化

### 並列データフェッチング

```typescript
// ✅ 良い例: Promise.allで並列フェッチング
export default async function DashboardPage() {
  const [spaces, reservations, users] = await Promise.all([
    prisma.space.count(),
    prisma.reservation.count(),
    prisma.user.count(),
  ])

  return (
    <div>
      <Stats spaces={spaces} reservations={reservations} users={users} />
    </div>
  )
}
```

### 動的インポート

```typescript
// ✅ 良い例: 大きなライブラリの動的インポート
'use client'

import dynamic from 'next/dynamic'

const ThreeJSComponent = dynamic(
  () => import('@/components/public/ThreeJSComponent'),
  {
    ssr: false,
    loading: () => <div>Loading...</div>,
  }
)

export default function Page() {
  return <ThreeJSComponent />
}
```

---

## セキュリティベストプラクティス

詳細は [`SECURITY.md`](./SECURITY.md) を参照してください。

### 入力検証

```typescript
// ✅ 良い例: Zodスキーマでバリデーション
import { z } from 'zod'

const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
})

export async function createSpace(data: unknown) {
  // サーバーサイドで必ずバリデーション
  const validatedData = createSpaceSchema.parse(data)
  // ...
}
```

### 認証・認可チェック

```typescript
// ✅ 良い例: すべての管理操作で認証チェック
export async function createSpace(data: CreateSpaceData) {
  const session = await auth()
  
  if (!session || session.user.role !== 'admin') {
    throw new Error('Unauthorized')
  }

  // ... 実装
}
```

### キャッシングのセキュリティ

**原則**: 機密情報や認証状態に依存するデータはキャッシュしない

```typescript
// ❌ 悪い例: ユーザー固有のデータをキャッシュ
const getUserReservations = unstable_cache(
  async (userId: string) => {
    return await prisma.reservation.findMany({ where: { userId } })
  },
  ['reservations', userId], // ユーザーIDを含むキャッシュキー
)

// ✅ 良い例: ユーザー固有のデータはキャッシュしない
export async function getUserReservations(userId: string) {
  unstable_noStore() // ユーザー固有のデータはキャッシュしない
  return await prisma.reservation.findMany({ where: { userId } })
}
```

詳細は [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) の「セキュリティ考慮事項」セクションを参照してください。

---

## TypeScript 型安全性ベストプラクティス

> **Note**: このセクションでは、TypeScript 5.9.3、React 19、Next.js 16、Prisma 7、Zod 4.3.5の最新の公式推奨に基づく型安全性のベストプラクティスを記載しています。

### 基本原則

**原則**: 型安全性を最優先し、コンパイル時にエラーを検出します。

1. **Strict Mode**: TypeScript strict modeを有効化（`tsconfig.json`で`strict: true`）
2. **明示的な型注釈**: 関数のパラメータと戻り値には必ず型を明示
3. **`unknown`型の使用**: `any`の代わりに`unknown`を使用し、型ガードで検証
4. **型推論の活用**: 明確な場合は型推論を使用（Prismaクエリ結果など）
5. **型の再利用**: DRY原則に従い、型定義を再利用可能に

### TypeScript 5.9の新機能とベストプラクティス

#### `satisfies`演算子の活用

`satisfies`演算子を使用して、型の検証と型推論の両方を実現します。

```typescript
// ✅ 良い例: satisfies演算子で型の検証と推論を両立
const config = {
  apiUrl: 'https://api.example.com',
  timeout: 5000,
  retries: 3,
} satisfies {
  apiUrl: string
  timeout: number
  retries: number
}

// configの型は推論されるが、型の検証も行われる
const url: string = config.apiUrl // ✅ OK
```

#### `unknown`型の使用

`any`の代わりに`unknown`を使用し、型ガードで検証します。

```typescript
// ❌ 悪い例: any型を使用
function processData(data: any) {
  return data.name.toUpperCase() // 型安全性がない
}

// ✅ 良い例: unknown型と型ガードを使用
function processData(data: unknown): string {
  if (typeof data === 'object' && data !== null && 'name' in data) {
    if (typeof data.name === 'string') {
      return data.name.toUpperCase()
    }
  }
  throw new Error('Invalid data')
}

// ✅ より良い例: 型ガード関数を使用
function isDataWithName(obj: unknown): obj is { name: string } {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'name' in obj &&
    typeof (obj as { name: unknown }).name === 'string'
  )
}

function processData(data: unknown): string {
  if (isDataWithName(data)) {
    return data.name.toUpperCase() // 型が保証されている
  }
  throw new Error('Invalid data')
}
```

#### ユーティリティ型の活用

TypeScriptのユーティリティ型を活用して型を操作します。

```typescript
// ✅ 良い例: ユーティリティ型の活用
interface User {
  id: string
  name: string
  email: string
  role: 'admin' | 'user'
}

// Partial: すべてのプロパティをオプショナルに
type UserUpdate = Partial<User>

// Pick: 特定のプロパティのみ選択
type UserPublic = Pick<User, 'id' | 'name'>

// Omit: 特定のプロパティを除外
type UserWithoutId = Omit<User, 'id'>

// Required: すべてのプロパティを必須に
type UserRequired = Required<Partial<User>>
```

### React 19 + Next.js 16の型安全性

#### Server Componentsの型安全性

Server Componentsでは、型安全性を確保するために適切な型定義を使用します。

```typescript
// ✅ 良い例: Server Componentの型定義
// src/app/spaces/[id]/page.tsx
import { prisma } from '@/lib/prisma'
import { notFound } from 'next/navigation'

interface PageProps {
  params: Promise<{ id: string }>
}

export default async function SpacePage({ params }: PageProps) {
  const { id } = await params // Next.js 16ではparamsはPromise
  
  const space = await prisma.space.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      description: true,
      hourlyPrice: true,
    },
  })

  if (!space) {
    notFound()
  }

  return <SpaceDetails space={space} />
}
```

#### Server Actionsの型安全性

Server Actionsでは、Zodスキーマから型を推論し、明示的な戻り値の型を定義します。

```typescript
// ✅ 良い例: Server Actionの型安全性
'use server'

import { z } from 'zod'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { createSpaceSchema } from '@/lib/validations/space'

// Zodスキーマから型を推論
type CreateSpaceInput = z.infer<typeof createSpaceSchema>

// 戻り値の型を明示的に定義
type CreateSpaceResult =
  | { success: true; spaceId: string }
  | { success: false; error: string; details?: z.ZodError }

export async function createSpace(
  data: CreateSpaceInput
): Promise<CreateSpaceResult> {
  try {
    // サーバーサイドで再度バリデーション（型安全性の確保）
    const validatedData = createSpaceSchema.parse(data)
    
    const space = await prisma.space.create({
      data: validatedData,
    })

    revalidatePath('/spaces')
    
    return { success: true, spaceId: space.id }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        details: error,
      }
    }
    
    return {
      success: false,
      error: 'Failed to create space',
    }
  }
}
```

#### Promise型の扱い（React 19の`use()`フック）

React 19では、Promiseを直接Client Componentに渡して`use()`で解決できます。

```typescript
// ✅ 良い例: Promise型の型安全性
// Server Component
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'

async function BlogPostPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params
  
  const post = await prisma.blogPost.findUnique({
    where: { slug },
  })

  if (!post) {
    notFound()
  }

  // Promise型を明示的に定義
  const commentsPromise: Promise<Comment[]> = prisma.comment.findMany({
    where: { postId: post.id },
  })

  return (
    <article>
      <h1>{post.title}</h1>
      <Suspense fallback={<CommentsLoading />}>
        <Comments commentsPromise={commentsPromise} />
      </Suspense>
    </article>
  )
}

// Client Component
'use client'
import { use } from 'react'

interface CommentsProps {
  commentsPromise: Promise<Comment[]>
}

function Comments({ commentsPromise }: CommentsProps) {
  const comments = use(commentsPromise) // Promise型が保証されている
  
  return (
    <div>
      {comments.map(comment => (
        <CommentItem key={comment.id} comment={comment} />
      ))}
    </div>
  )
}
```

#### Route Handlersの型安全性

Route Handlersでは、`NextRequest`と`NextResponse`の型を適切に使用します。

```typescript
// ✅ 良い例: Route Handlerの型安全性
// src/app/api/spaces/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { prisma } from '@/lib/prisma'

const getSpacesQuerySchema = z.object({
  page: z.string().optional().transform(val => (val ? parseInt(val, 10) : 1)),
  limit: z.string().optional().transform(val => (val ? parseInt(val, 10) : 12)),
})

export async function GET(request: NextRequest): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(request.url)
    const query = getSpacesQuerySchema.parse({
      page: searchParams.get('page'),
      limit: searchParams.get('limit'),
    })

    const spaces = await prisma.space.findMany({
      where: { isPublished: true },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    })

    return NextResponse.json({ spaces })
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: 'Invalid query parameters', details: error.errors },
        { status: 400 }
      )
    }

    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    )
  }
}
```

### Prisma 7の型安全性

#### `select`と`include`の型推論

Prismaの`select`と`include`を使用して、必要なフィールドのみを取得し、型安全性を確保します。

```typescript
// ✅ 良い例: selectで型を制限
const space = await prisma.space.findUnique({
  where: { id },
  select: {
    id: true,
    name: true,
    hourlyPrice: true,
    // 他のフィールドは型に含まれない
  },
})

// spaceの型は { id: string; name: string; hourlyPrice: number } になる

// ✅ 良い例: includeで関連データの型も推論
const reservation = await prisma.reservation.findUnique({
  where: { id },
  include: {
    space: {
      select: {
        id: true,
        name: true,
        hourlyPrice: true,
      },
    },
    user: {
      select: {
        id: true,
        name: true,
        email: true,
      },
    },
  },
})

// reservationの型は適切に推論される
```

#### Prisma型の再利用

Prismaの生成型を再利用して、型の一貫性を保ちます。

```typescript
// ✅ 良い例: Prisma型の再利用（Prisma 7推奨）
import type { Prisma } from '@/generated/prisma/client'

// Prismaの生成型を使用
type SpaceCreateInput = Prisma.SpaceCreateInput
type SpaceUpdateInput = Prisma.SpaceUpdateInput
type SpaceWhereInput = Prisma.SpaceWhereInput

// カスタム型をPrisma型から構築
type SpaceWithReservations = Prisma.SpaceGetPayload<{
  include: {
    reservations: true
  }
}>

// 特定のフィールドのみを含む型
type SpacePublic = Prisma.SpaceGetPayload<{
  select: {
    id: true
    name: true
    hourlyPrice: true
  }
}>
```

### Zod 4.3.5の型安全性

#### `z.infer`、`z.output`、`z.input`の使い分け

Zod 4.3.5では、`z.infer`、`z.output`、`z.input`を適切に使い分けます。

```typescript
// ✅ 良い例: Zod型の使い分け
import { z } from 'zod'

const createSpaceSchema = z.object({
  name: z.string().min(1).max(100),
  description: z.string().min(1).max(2000),
  capacity: z.number().int().positive(),
  hourlyPrice: z.number().nonnegative(),
})

// z.infer: スキーマから推論される型（通常はz.outputと同じ）
type CreateSpaceInput = z.infer<typeof createSpaceSchema>

// z.input: 入力時の型（変換前、例: z.preprocessを使用する場合）
type CreateSpaceInputRaw = z.input<typeof createSpaceSchema>

// z.output: 出力時の型（変換後、例: z.transformを使用する場合）
type CreateSpaceOutput = z.output<typeof createSpaceSchema>

// Server Actionでの使用
export async function createSpace(
  data: CreateSpaceInput
): Promise<{ success: boolean; spaceId?: string }> {
  // parse()はz.output型を返す
  const validatedData = createSpaceSchema.parse(data)
  
  // validatedDataの型はCreateSpaceOutput（この場合はCreateSpaceInputと同じ）
  const space = await prisma.space.create({
    data: validatedData,
  })

  return { success: true, spaceId: space.id }
}
```

#### 型ガードとしてのZodスキーマ

Zodスキーマを型ガードとして使用します。

```typescript
// ✅ 良い例: Zodスキーマを型ガードとして使用
import { z } from 'zod'

const spaceSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  hourlyPrice: z.number().nonnegative(),
})

// 型ガード関数
function isSpace(data: unknown): data is z.infer<typeof spaceSchema> {
  return spaceSchema.safeParse(data).success
}

// 使用例
function processSpace(data: unknown) {
  if (isSpace(data)) {
    // dataの型が保証されている
    console.log(data.name, data.hourlyPrice)
  } else {
    throw new Error('Invalid space data')
  }
}
```

### エラーハンドリングの型安全性

#### 判別可能なユニオン型（Discriminated Unions）

エラーハンドリングでは、判別可能なユニオン型を使用して型安全性を確保します。

```typescript
// ✅ 良い例: 判別可能なユニオン型
type Result<T> =
  | { success: true; data: T }
  | { success: false; error: string; code?: string; details?: unknown }

export async function createSpace(
  data: CreateSpaceInput
): Promise<Result<Space>> {
  try {
    const validatedData = createSpaceSchema.parse(data)
    const space = await prisma.space.create({
      data: validatedData,
    })

    return { success: true, data: space }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        code: 'VALIDATION_ERROR',
        details: error.errors,
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
          code: 'DUPLICATE_ENTRY',
        }
      }
    }

    return {
      success: false,
      error: 'An unexpected error occurred',
      code: 'UNKNOWN_ERROR',
      details: error,
    }
  }
}

// 使用例: 型安全性が保証される
const result = await createSpace(data)
if (result.success) {
  // result.dataの型がSpaceに絞り込まれる
  console.log(result.data.name)
} else {
  // result.errorの型がstringに絞り込まれる
  console.error(result.error, result.code)
}
```

### 型の再利用とDRY原則

#### 型定義の一元管理

型定義を一元管理し、再利用可能にします。

```typescript
// ✅ 良い例: 型定義の一元管理
// src/types/space.ts
import { z } from 'zod'
import type { Prisma } from '@/generated/prisma/client'
import { createSpaceSchema, updateSpaceSchema } from '@/lib/validations/space'

// Zodスキーマから型を推論
export type CreateSpaceInput = z.infer<typeof createSpaceSchema>
export type UpdateSpaceInput = z.infer<typeof updateSpaceSchema>

// Prisma型を再利用
export type Space = Prisma.SpaceGetPayload<{}>
export type SpaceCreateInput = Prisma.SpaceCreateInput
export type SpaceUpdateInput = Prisma.SpaceUpdateInput

// カスタム型を定義
export type SpaceWithReservations = Prisma.SpaceGetPayload<{
  include: {
    reservations: true
  }
}>

export type SpacePublic = Prisma.SpaceGetPayload<{
  select: {
    id: true
    name: true
    mainImageUrl: true
    hourlyPrice: true
  }
}>
```

#### コンポーネントPropsの型定義

コンポーネントPropsの型定義を適切に管理します。

```typescript
// ✅ 良い例: コンポーネントPropsの型定義
// src/components/public/SpaceCard.tsx
import type { SpacePublic } from '@/types/space'

interface SpaceCardProps {
  space: SpacePublic
  onSelect?: (id: string) => void
  className?: string
}

export function SpaceCard({ space, onSelect, className }: SpaceCardProps) {
  return (
    <div className={className}>
      <h2>{space.name}</h2>
      <img src={space.mainImageUrl} alt={space.name} />
      <p>¥{space.hourlyPrice}/hour</p>
      {onSelect && (
        <button onClick={() => onSelect(space.id)}>選択</button>
      )}
    </div>
  )
}
```

### 型安全性チェックリスト

実装時に以下のチェックリストを確認します：

- [ ] 関数のパラメータと戻り値に型注釈がある
- [ ] `any`型を使用していない（`unknown`を使用）
- [ ] Zodスキーマから型を推論している（`z.infer`）
- [ ] Prisma型を適切に使用している（`Prisma.*`型）
- [ ] エラーハンドリングで判別可能なユニオン型を使用している
- [ ] 型ガードを適切に使用している
- [ ] 型定義を再利用可能にしている（DRY原則）
- [ ] Server ComponentsとServer Actionsで適切な型を使用している

**関連ドキュメント**:
- [`.cursor/skills/typescript-strict/SKILL.md`](../.cursor/skills/typescript-strict/SKILL.md) - TypeScript strict mode詳細ガイド
- [`.cursor/rules/code-style/RULE.md`](../.cursor/rules/code-style/RULE.md) - コードスタイル標準

---

## Tailwind CSS スタイリング戦略

### 基本方針

このプロジェクトでは、**公開ページ**と**管理画面**で異なるスタイリングアプローチを採用しています。それぞれの要件に最適化されたライブラリを選択することで、開発効率とデザイン品質を両立します。

### 公開ページ: tailwind-merge + tailwind-variants

**採用理由**:
- **デザイン統一性**: tailwind-variantsは、コンポーネントのバリアント管理に特化しており、ブランドアイデンティティを一貫して表現できます
- **パフォーマンス**: tailwind-variants v2は大幅なパフォーマンス改善が行われており、大規模な公開ページでも高速に動作します
- **柔軟性**: カスタムデザインシステムを構築しやすく、ブランド固有のスタイルを実現できます
- **保守性**: バリアント定義が構造化されており、デザインシステムの拡張が容易です

**使用例**:
```typescript
// src/components/public/Button.tsx
'use client'

import { tv } from 'tailwind-variants'
import { cn } from '@/lib/utils'

const buttonVariants = tv({
  base: 'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 disabled:pointer-events-none disabled:opacity-50',
  variants: {
    variant: {
      default: 'bg-primary text-primary-foreground hover:bg-primary/90',
      outline: 'border border-input bg-background hover:bg-accent hover:text-accent-foreground',
      ghost: 'hover:bg-accent hover:text-accent-foreground',
    },
    size: {
      default: 'h-10 px-4 py-2',
      sm: 'h-9 rounded-md px-3',
      lg: 'h-11 rounded-md px-8',
    },
  },
  defaultVariants: {
    variant: 'default',
    size: 'default',
  },
})

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'outline' | 'ghost'
  size?: 'default' | 'sm' | 'lg'
}

export function Button({ className, variant, size, ...props }: ButtonProps) {
  return (
    <button
      className={cn(buttonVariants({ variant, size }), className)}
      {...props}
    />
  )
}
```

**実装場所**:
- `src/components/public/**` - 公開ページ用コンポーネント
- `src/app/(public)/**` - 公開ページのページコンポーネント

### 管理画面: tailwind-merge + shadcn/ui

**採用理由**:
- **開発効率**: shadcn/uiは、すぐに使える高品質なコンポーネントを提供し、管理画面の開発を加速します
- **アクセシビリティ**: Radix UIベースで、WAI-ARIAガイドラインに準拠したアクセシブルなコンポーネントです
- **機能性**: データテーブル、フォーム、モーダルなど、管理画面に必要なコンポーネントが豊富に揃っています
- **カスタマイズ性**: コンポーネントコードを直接プロジェクトにコピーするため、完全なカスタマイズが可能です
- **保守性**: 既存のテンプレートやベストプラクティスを活用できます

**使用例**:
```typescript
// src/components/ui/button.tsx (shadcn/ui)
import * as React from 'react'
import { cn } from '@/lib/utils'

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link'
  size?: 'default' | 'sm' | 'lg' | 'icon'
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'default', ...props }, ref) => {
    return (
      <button
        className={cn(
          'inline-flex items-center justify-center rounded-md text-sm font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50',
          {
            'bg-primary text-primary-foreground hover:bg-primary/90': variant === 'default',
            'bg-destructive text-destructive-foreground hover:bg-destructive/90': variant === 'destructive',
            'border border-input bg-background hover:bg-accent hover:text-accent-foreground': variant === 'outline',
            'bg-secondary text-secondary-foreground hover:bg-secondary/80': variant === 'secondary',
            'hover:bg-accent hover:text-accent-foreground': variant === 'ghost',
            'text-primary underline-offset-4 hover:underline': variant === 'link',
          },
          {
            'h-10 px-4 py-2': size === 'default',
            'h-9 rounded-md px-3': size === 'sm',
            'h-11 rounded-md px-8': size === 'lg',
            'h-10 w-10': size === 'icon',
          },
          className
        )}
        ref={ref}
        {...props}
      />
    )
  }
)
Button.displayName = 'Button'

export { Button }
```

**実装場所**:
- `src/components/ui/**` - shadcn/uiコンポーネント（管理画面用）
- `src/components/admin/**` - 管理画面専用コンポーネント
- `src/app/(admin)/**` - 管理画面のページコンポーネント

### shadcn/uiとtailwind-variantsの関係

**重要な理解**: shadcn/uiとtailwind-variantsは**異なる役割**を持ち、**併用可能**です。

#### shadcn/uiの内部実装

shadcn/uiは内部的に以下のライブラリを使用しています：
- **class-variance-authority (CVA)**: バリアント管理（tailwind-variantsの前身）
- **clsx**: 条件付きクラス名の連結
- **tailwind-merge**: Tailwind CSSクラスのマージと競合解決

shadcn/uiのコンポーネントは、CVAを使ってバリアントを定義していますが、**tailwind-variantsは使用していません**。

#### tailwind-variantsの役割

tailwind-variantsは、CVAの**進化版・代替版**として開発されました：
- **より良い型推論**: TypeScriptの型推論が強化されています
- **パフォーマンス**: v2で大幅なパフォーマンス改善が行われています
- **柔軟性**: より柔軟なバリアント定義が可能です
- **コンポーネント合成**: コンポーネントの拡張と合成が容易です

#### なぜ両方を使うのか？

1. **公開ページ**: tailwind-variantsでカスタムデザインシステムを構築
   - ブランド固有のスタイルを構造化して管理
   - shadcn/uiのコンポーネントは不要（公開ページは独自デザイン）

2. **管理画面**: shadcn/uiで開発効率を向上
   - すぐに使える高品質なコンポーネント
   - 必要に応じてtailwind-variantsで拡張可能

3. **併用パターン**: 管理画面でもtailwind-variantsを併用可能
   ```typescript
   // shadcn/uiコンポーネントをtailwind-variantsで拡張
   import { Button } from '@/components/ui/button'
   import { tv } from 'tailwind-variants'
   
   const customButtonVariants = tv({
     base: '', // shadcn/uiのButtonをベースに
     variants: {
       // カスタムバリアントを追加
     },
   })
   ```

#### 選択肢の整理

| シナリオ | 推奨アプローチ | 理由 |
|---------|--------------|------|
| **公開ページ（カスタムデザイン）** | tailwind-variants | ブランド固有のデザインシステム構築 |
| **管理画面（標準UI）** | shadcn/ui | 開発効率とアクセシビリティ |
| **管理画面（カスタム拡張）** | shadcn/ui + tailwind-variants | shadcn/uiをベースにtailwind-variantsで拡張 |
| **管理画面（シンプル）** | shadcn/uiのみ | tailwind-variantsなしでも十分 |

**結論**: shadcn/uiがあっても、tailwind-variantsは**別の役割**があります。公開ページではtailwind-variantsでカスタムデザインシステムを構築し、管理画面ではshadcn/uiで開発効率を向上させます。必要に応じて併用も可能です。

### tailwind-mergeの共通使用

**両方のアプローチで使用**:
- **目的**: Tailwind CSSクラスのマージと競合解決
- **実装**: `src/lib/utils.ts`に共通ユーティリティとして実装

```typescript
// src/lib/utils.ts
import { type ClassValue, clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}
```

### パッケージインストール

#### 最小構成（管理画面のみshadcn/uiを使用する場合）

```bash
# 共通パッケージ（必須）
bun add tailwind-merge clsx

# 管理画面用（shadcn/ui CLIを使用）
npx shadcn@latest init
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add table
# ... その他の必要なコンポーネント
```

**注意**: この構成では、公開ページは通常のTailwind CSSクラスを使用します。tailwind-variantsは不要です。

#### 推奨構成（公開ページでtailwind-variantsを使用する場合）

```bash
# 共通パッケージ（必須）
bun add tailwind-merge clsx

# 公開ページ用
bun add tailwind-variants

# 管理画面用（shadcn/ui CLIを使用）
npx shadcn@latest init
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add table
# ... その他の必要なコンポーネント
```

**推奨理由**: 公開ページでカスタムデザインシステムを構築する場合、tailwind-variantsにより構造化されたバリアント管理が可能になります。

#### オプション構成（管理画面でもtailwind-variantsを併用する場合）

```bash
# 共通パッケージ（必須）
bun add tailwind-merge clsx

# 両方で使用
bun add tailwind-variants

# 管理画面用（shadcn/ui CLIを使用）
npx shadcn@latest init
npx shadcn@latest add button
npx shadcn@latest add input
npx shadcn@latest add table
# ... その他の必要なコンポーネント
```

**使用例**: shadcn/uiコンポーネントをtailwind-variantsで拡張する場合に有効です。

### 使い分けの判断基準

#### 公開ページ vs 管理画面

| 要件 | 公開ページ | 管理画面 |
|------|----------|---------|
| **デザイン統一性** | ⭐⭐⭐ 最重要 | ⭐⭐ 重要 |
| **開発速度** | ⭐⭐ 重要 | ⭐⭐⭐ 最重要 |
| **アクセシビリティ** | ⭐⭐ 重要 | ⭐⭐⭐ 最重要 |
| **カスタマイズ性** | ⭐⭐⭐ 最重要 | ⭐⭐ 重要 |
| **機能の豊富さ** | ⭐ 必要に応じて | ⭐⭐⭐ 最重要 |

#### tailwind-variantsが必要な場合

**✅ 使用を推奨**:
- 公開ページでカスタムデザインシステムを構築する場合
- ブランド固有のスタイルを構造化して管理したい場合
- 複雑なバリアント定義が必要な場合
- 型安全なバリアント管理が必要な場合

**❌ 不要な場合**:
- 管理画面のみでshadcn/uiを使用する場合（shadcn/uiはCVAを使用）
- シンプルなTailwind CSSクラスのみで十分な場合
- 既存のshadcn/uiコンポーネントで要件を満たせる場合

#### shadcn/uiが必要な場合

**✅ 使用を推奨**:
- 管理画面の開発を加速したい場合
- アクセシブルなコンポーネントが必要な場合
- データテーブル、フォーム、モーダルなど標準的なUIが必要な場合
- Radix UIベースのコンポーネントが必要な場合

**❌ 不要な場合**:
- 公開ページで完全にカスタムデザインを使用する場合
- 既存のコンポーネントライブラリを使用している場合

### ベストプラクティス

1. **コンポーネントの分離**: 公開ページと管理画面のコンポーネントは明確に分離します
   - `src/components/public/**` - 公開ページ用（tailwind-variants）
   - `src/components/ui/**` - 管理画面用（shadcn/ui）
   - `src/components/admin/**` - 管理画面専用コンポーネント

2. **スタイルの統一**: 各アプローチ内で一貫したスタイリングを維持します
   - 公開ページ: tailwind-variantsのバリアント定義を統一
   - 管理画面: shadcn/uiのテーマ設定を統一

3. **パフォーマンス**: 不要なコンポーネントのインポートを避けます
   - 動的インポートを活用（必要に応じて）
   - Tree-shakingを意識した実装

4. **型安全性**: TypeScriptの型定義を活用します
   - tailwind-variants: バリアントの型推論を活用
   - shadcn/ui: コンポーネントのProps型を活用

---

## 参考資料

### プロジェクトドキュメント

- [`CLAUDE.md`](../CLAUDE.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) - キャッシング戦略
- [`API.md`](./API.md) - API仕様
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシー
- [`ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md`](./ARCHITECTURE_IMPROVEMENT_REQUIREMENTS.md) - アーキテクチャ改善要件定義

### 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Auth.js Documentation](https://authjs.dev)

---

## 更新履歴

- **2026-01-08**: Context7で取得した最新情報に基づき、以下の更新を実施
  - Next.js 16の`revalidateTag`の`profile`パラメータ（`'max'`）の詳細な説明を追加（stale-while-revalidate semantics）
  - `updateTag`と`refresh`の詳細な説明を追加（read-your-own-writesシナリオ、現在のページのキャッシュ更新）
  - React 19の`use()`フックのエラーハンドリング説明を強化（Error Boundaryとの組み合わせ）
  - Prisma 7のdriver adaptersの詳細な説明を追加（`@prisma/adapter-pg`の使用例、接続プーリング設定）
  - Auth.js 5の最新パターンを更新（Prisma 7対応、`@/generated/prisma/client`からのインポート）
- **2026-01-08**: Next.js 16の非同期paramsパターンに全コード例を修正（`Promise<{ id: string }>`形式、`await params`使用）
- **2026-01-06**: TypeScript型安全性ベストプラクティスセクションを追加
  - TypeScript 5.9の新機能（`satisfies`演算子、`unknown`型の推奨）
  - React 19 + Next.js 16の型安全性（Server Components、Server Actions、Promise型）
  - Prisma 7の型安全性（`select`/`include`の型推論、`Prisma.GetPayload`）
  - Zod 4.3.5の型安全性（`z.infer`、`z.input`、`z.output`の使い分け）
  - エラーハンドリングの型安全性（判別可能なユニオン型）
  - 型の再利用とDRY原則
- **2026-01-06**: Tailwind CSSスタイリング戦略を更新（shadcn/uiとtailwind-variantsの関係を明確化、選択肢の整理）
- **2026-01-06**: Tailwind CSSスタイリング戦略を追加（公開ページ: tailwind-variants、管理画面: shadcn/ui）
- **2026-01-06**: キャッシングのセキュリティベストプラクティスを追加
- **2026-01-06**: 初版作成、Next.js 16、React 19、Prisma 7、Auth.js 5の最新ベストプラクティスを反映
