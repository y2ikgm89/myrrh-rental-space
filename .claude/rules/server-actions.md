# Server Actions ルール

> Next.js 16 / PPR対応

## データキャッシュパターン（'use cache'）

### 1. 基本的なキャッシュ

**Next.js 16新API**: `'use cache'`ディレクティブでデータをキャッシュ:

```typescript
// 関数レベルのキャッシュ
async function getCachedPosts() {
  'use cache'
  return await prisma.post.findMany({ where: { isPublished: true } })
}

// cacheTagでタグ付け（無効化用）
import { cacheTag } from 'next/cache'

async function getCachedPost(slug: string) {
  'use cache'
  cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug))
  return await prisma.post.findUnique({ where: { slug } })
}
```

### 2. キャッシュ有効期限（cacheLife）

```typescript
import { cacheLife } from 'next/cache'

// プリセット使用
async function getSettings() {
  'use cache'
  cacheLife('hours')  // 1時間
  return await prisma.settings.findFirst()
}

// カスタム有効期限
async function getPopularPosts() {
  'use cache'
  cacheLife({
    stale: 300,      // 5分間はstaleでも返す
    revalidate: 60,  // 1分後にバックグラウンド再検証
    expire: 3600,    // 1時間で完全失効
  })
  return await prisma.post.findMany({ take: 10, orderBy: { viewCount: 'desc' } })
}
```

### cacheLifeプリセット

| プリセット | stale | revalidate | expire |
|-----------|-------|------------|--------|
| `'seconds'` | 30秒 | 1秒 | 60秒 |
| `'minutes'` | 5分 | 1分 | 1時間 |
| `'hours'` | 5分 | 1時間 | 1日 |
| `'days'` | 5分 | 1日 | 1週間 |
| `'weeks'` | 5分 | 1週間 | 1ヶ月 |
| `'max'` | 5分 | 1ヶ月 | 1年 |

## キャッシュ無効化パターン

### 1. updateTag（read-your-own-writes用）

**Next.js 16新API**: 自分の変更を即座に反映させる場合に使用:

```typescript
import { updateTag } from 'next/cache'
import { redirect } from 'next/navigation'

export async function createPost(data: PostInput) {
  const post = await prisma.post.create({ data })

  // 即時キャッシュ失効（Server Actions内のみ使用可）
  updateTag(CACHE_TAGS.POSTS)
  updateTag(getCacheTag.posts.detail(post.slug))

  redirect(`/posts/${post.slug}`)  // 新規作成直後に最新データを表示
}
```

### 2. revalidateTag（非同期再検証）

遅延が許容される場合（バックグラウンド処理等）:

```typescript
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'

// リスト全体を無効化
revalidateTag(CACHE_TAGS.POSTS)

// 個別アイテムを無効化
revalidateTag(getCacheTag.posts.detail(slug))
```

### updateTag vs revalidateTag

| API | 用途 | 使用場所 |
|-----|------|----------|
| `updateTag` | 即時失効（read-your-own-writes） | Server Actions内のみ |
| `revalidateTag` | 非同期再検証（遅延OK） | Server Actions、Route Handlers |

### 3. revalidatePath

ページ全体の再検証（タグで対応できない場合のみ）:

```typescript
import { revalidatePath } from 'next/cache'

// 特定ページ
revalidatePath('/posts')

// レイアウト全体
revalidatePath('/admin', 'layout')
```

### 4. キャッシュタグ命名規則

`@/shared/lib/constants/cache.ts` で一元管理。**cacheTag / revalidateTag / updateTag すべてで定数使用必須**:

```typescript
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'

// OK: 定数を使用
cacheTag(CACHE_TAGS.POSTS)
cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)
revalidateTag(CACHE_TAGS.POSTS)

// NG: マジックストリング
cacheTag('posts')
cacheTag('settings', 'layout-settings')
revalidateTag('posts')
```

## Server Action実装

### 基本構造

```typescript
'use server'

import { z } from 'zod'
import { updateTag } from 'next/cache'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { checkPermission } from '@/admin/lib/action-auth'
import type { ActionResult } from '@/admin/types'

export async function createPost(input: PostInput): Promise<ActionResult<Post>> {
  // 1. 認証・権限チェック
  const auth = await checkPermission('post', 'create')
  if (!auth.success) return auth.error

  // 2. バリデーション
  const validated = postSchema.safeParse(input)
  if (!validated.success) {
    return { success: false, error: z.flattenError(validated.error) }
  }

  try {
    // 3. データ操作
    const post = await prisma.post.create({ data: validated.data })

    // 4. キャッシュ即時失効（read-your-own-writes）
    updateTag(CACHE_TAGS.POSTS)

    return { success: true, data: post }
  } catch (error) {
    return { success: false, error: 'データベースエラーが発生しました' }
  }
}
```

### ActionResult型

一貫したレスポンス型を使用:

```typescript
// @/admin/types/server-actions.ts
export type ActionResult<T = void> =
  | { success: true; data?: T }
  | { success: false; error: string | ZodFlattenedError }
```

## 公開データ取得パターン（'use cache' + safeFetch）

認証不要の公開データ取得関数では `safeFetch` + `toPlainObject` を使用:

```typescript
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS } from '@/shared/lib/constants'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { toPlainObject } from '@/shared/lib/serialize'

export async function getPublicBusinessSettings() {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: { businessName: true, phoneNumber: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPublicBusinessSettings',
  })

  return toPlainObject(result)  // React 19: Symbolプロパティ除去
}
```

## 禁止事項

1. **マジックストリングのタグ名禁止**
   - `cacheTag('posts')` → `cacheTag(CACHE_TAGS.POSTS)`
   - `revalidateTag('posts')` → `revalidateTag(CACHE_TAGS.POSTS)`

2. **認証チェック漏れ禁止**
   - 管理画面アクションは必ず `checkAdminAuth()` または `checkPermission()` を呼び出す

3. **エラー握りつぶし禁止**
   - try-catchで必ずエラーを返す

4. **直接的なredirect禁止（useFormAction使用時）**
   - クライアント側で `redirectTo` オプションを使用

## 参考

- `@/shared/lib/constants/cache.ts` - キャッシュ定数
- `@/admin/lib/action-auth.ts` - 認証ヘルパー
- `@/admin/types/server-actions.ts` - ActionResult型
