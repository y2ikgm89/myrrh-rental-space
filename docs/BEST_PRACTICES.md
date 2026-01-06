# ベストプラクティスガイド

> **Note**: このドキュメントには、Next.js 16、React 19、Prisma 7、Auth.js 5の最新の公式推奨に基づくベストプラクティスが記載されています。技術スタックの詳細については、[`AGENTS.md`](../AGENTS.md)を参照してください。

**最終更新**: 2026-01-06

---

## 概要

このドキュメントは、レンタルスペース管理システムで使用する技術スタックの最新の公式推奨に基づく実装ガイドラインです。後方互換性を考慮せず、最新のクリーンな実装を目指します。

---

## Next.js 16 App Router ベストプラクティス

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

export default async function SpacePage({ params }: { params: { id: string } }) {
  const space = await prisma.space.findUnique({
    where: { id: params.id },
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

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  // Server Componentでは直接awaitを使用
  const post = await prisma.blogPost.findUnique({
    where: { slug: params.slug, isPublished: true },
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

```typescript
// ✅ 良い例: Suspenseでローディング状態を管理
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

### Promiseを直接Client Componentに渡すパターン

React 19では、Server ComponentでPromiseを作成し、それを直接Client Componentに渡して`use()`で解決できます。

```typescript
// ✅ 良い例: Promiseを直接渡してClient Componentでawait
// src/app/blog/[slug]/page.tsx
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'

async function BlogPostPage({ params }: { params: { slug: string } }) {
  // 重要なデータはawaitで取得
  const post = await prisma.blogPost.findUnique({
    where: { slug: params.slug, isPublished: true },
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

## Prisma 7 ベストプラクティス

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

```typescript
// ✅ 良い例: Auth.js 5の設定
// src/lib/auth.ts
import NextAuth from 'next-auth'
import { PrismaAdapter } from '@auth/prisma-adapter'
import { prisma } from '@/lib/prisma'
import authConfig from './auth.config'

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(prisma),
  session: { strategy: 'jwt' },
  ...authConfig,
})
```

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

```typescript
// ✅ 良い例: 適切なエラーハンドリング
'use server'

import { revalidatePath } from 'next/cache'
import { z } from 'zod'

export async function createSpace(formData: FormData) {
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

    return { success: true, spaceId: space.id }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return {
        success: false,
        error: 'Validation error',
        details: error.errors,
      }
    }

    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === 'P2002') {
        return {
          success: false,
          error: 'Duplicate entry',
        }
      }
    }

    console.error('Unexpected error:', error)
    return {
      success: false,
      error: 'An unexpected error occurred',
    }
  }
}
```

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

## 参考資料

### プロジェクトドキュメント

- [`AGENTS.md`](../AGENTS.md) - プロジェクト全体の仕様書
- [`ARCHITECTURE.md`](./ARCHITECTURE.md) - システムアーキテクチャ
- [`CACHING_STRATEGY.md`](./CACHING_STRATEGY.md) - キャッシング戦略
- [`API.md`](./API.md) - API仕様
- [`SECURITY.md`](./SECURITY.md) - セキュリティポリシー

### 外部リソース

- [Next.js 16 Documentation](https://nextjs.org/docs)
- [React 19 Documentation](https://react.dev)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Auth.js Documentation](https://authjs.dev)

---

## 更新履歴

- **2026-01-06**: キャッシングのセキュリティベストプラクティスを追加
- **2026-01-06**: 初版作成、Next.js 16、React 19、Prisma 7、Auth.js 5の最新ベストプラクティスを反映
