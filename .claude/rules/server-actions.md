---
paths:
  - src/app/**
  - src/shared/**
---

# Server Actions ルール

> Next.js 16 / 'use cache' / PPR 対応

## 'use cache' パターン（Next.js 16 新API）

### 基本キャッシュ（関数レベル）

`'use cache'` ディレクティブで非同期関数の結果をキャッシュ:

```typescript
// NG: キャッシュなし（毎リクエストで DB アクセス）
async function getPosts() {
  return await prisma.post.findMany({ where: { isPublished: true } })
}

// OK: 関数レベルのキャッシュ
async function getPosts() {
  'use cache'
  return await prisma.post.findMany({ where: { isPublished: true } })
}
```

### cacheTag でタグ付け

`cacheTag()` で後から無効化できるようにタグを付与。**CACHE_TAGS 定数必須**（マジックストリング禁止）:

```typescript
import { cacheTag, cacheLife } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'

// 単一タグ
async function getPosts() {
  'use cache'
  cacheTag(CACHE_TAGS.POSTS)
  return await prisma.post.findMany({ where: { isPublished: true } })
}

// 複数タグ（リスト + 詳細）
async function getPost(slug: string) {
  'use cache'
  cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug))
  return await prisma.post.findUnique({ where: { slug } })
}

// 複数ドメインタグ（Settings は複数タグを付与）
async function getPublicBusinessSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS)
  // ...
}
```

### CACHE_LIFE 定数（プロジェクト標準）

`@/shared/lib/constants/cache.ts` の `CACHE_LIFE` を使用。cacheLife プリセット文字列を直接書かない:

```typescript
import { CACHE_LIFE } from '@/shared/lib/constants'

// NG: マジックストリング
cacheLife('hours')

// OK: CACHE_LIFE 定数
cacheLife(CACHE_LIFE.PUBLIC_CONTENT)   // 'hours'
cacheLife(CACHE_LIFE.STATIC_SETTINGS)  // 'days'
cacheLife(CACHE_LIFE.DYNAMIC_DATA)     // 'minutes'
cacheLife(CACHE_LIFE.METADATA)         // 'hours'
```

| 定数 | プリセット | 用途 |
|------|-----------|------|
| `CACHE_LIFE.PUBLIC_CONTENT` | `'hours'` | ブログ・ニュース・スペース・ページ |
| `CACHE_LIFE.STATIC_SETTINGS` | `'days'` | サイト設定・ナビゲーション |
| `CACHE_LIFE.DYNAMIC_DATA` | `'minutes'` | 予約状況・在庫 |
| `CACHE_LIFE.METADATA` | `'hours'` | メタデータ・SEO |

### cacheLife プリセット一覧（参考）

| プリセット | stale | revalidate | expire |
|-----------|-------|------------|--------|
| `'seconds'` | 30秒 | 1秒 | 60秒 |
| `'minutes'` | 5分 | 1分 | 1時間 |
| `'hours'` | 5分 | 1時間 | 1日 |
| `'days'` | 5分 | 1日 | 1週間 |
| `'weeks'` | 5分 | 1週間 | 1ヶ月 |
| `'max'` | 5分 | 1ヶ月 | 1年 |

### カスタム有効期限

細かい制御が必要な場合のみ `{ stale, revalidate, expire }` オブジェクトを使用:

```typescript
import { toPlainArray } from '@/shared/lib/serialize'

async function getPopularPosts() {
  'use cache'
  cacheLife({
    stale: 300,      // 5分間は stale でも返す
    revalidate: 60,  // 60秒後にバックグラウンド再検証
    expire: 3600,    // 1時間で完全失効
  })
  cacheTag(CACHE_TAGS.POSTS)
  const result = await prisma.post.findMany({ take: 10, orderBy: { viewCount: 'desc' } })
  return toPlainArray(result)  // React 19: Prisma Symbol プロパティを除去（§禁止事項 item 7）
}
```

---

## キャッシュ無効化パターン

### updateTag（即時失効 — read-your-own-writes）

**Server Actions 内のみ使用可**。同一リクエスト内で変更を即座に反映させる場合に使用:

```typescript
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'

export async function createPost(data: CreatePostInput) {
  // ... DB 操作 ...
  const post = await prisma.post.create({ data: validated.data })

  // 即時失効（リスト + 詳細）
  updateTag(CACHE_TAGS.POSTS)
  updateTag(getCacheTag.posts.detail(post.slug))

  return createSuccess('投稿を作成しました', { id: post.id })
}

export async function deletePost(id: string) {
  // ... DB 操作 ...
  await prisma.post.delete({ where: { id } })

  // 関連タグをまとめて即時失効
  updateTag(CACHE_TAGS.POSTS)
  updateTag(CACHE_TAGS.HOMEPAGE_SECTIONS)

  return createSuccess('投稿を削除しました')
}
```

### revalidateTag（非同期再検証 — stale-while-revalidate）

即時性が不要な場合（バックグラウンド処理・Route Handlers など）:

```typescript
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from '@/shared/lib/constants'

// Route Handler（CRON / Webhook）— 実際のプロジェクト例
// src/app/api/cron/calendar-sync/route.ts
// src/app/api/webhooks/google-calendar/route.ts
// ⚠️ Next.js 16: revalidateTag は第2引数（プロファイル）が必須
export async function GET() {
  const result = await syncFromCalendar()
  // ⚠️ updateTag は Server Actions 専用 — Route Handler では revalidateTag を使う
  revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA)
  revalidateTag(getCacheTag.reservations.calendar(), CACHE_LIFE.DYNAMIC_DATA)
  return NextResponse.json({ ok: true })
}

// 個別アイテムのみ無効化（第2引数に適切なプロファイルを指定）
revalidateTag(getCacheTag.posts.detail(slug), CACHE_LIFE.PUBLIC_CONTENT)
```

### updateTag vs revalidateTag 比較

| API | 挙動 | 使用場所 | 適用シーン |
|-----|------|----------|-----------|
| `updateTag` | 即時失効（同一リクエスト内で反映） | **Server Actions 内のみ** | CRUD 操作後の read-your-own-writes |
| `revalidateTag` | 非同期再検証（次リクエストで反映） | Server Actions・Route Handlers | バックグラウンド処理・CRON・webhook |

### revalidatePath（最終手段）

タグで対応できない場合のみ。**原則 revalidateTag を優先**:

```typescript
import { revalidatePath } from 'next/cache'

// 特定ページ
revalidatePath('/posts')

// レイアウト全体
revalidatePath('/admin', 'layout')
```

---

## Server Action 実装パターン

### 基本構造（withPermission HOF パターン）

`withPermission` HOF は認証・認可・監査ログを自動化する。**最も推奨されるパターン**:

```typescript
'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { postSchema } from '@/admin/lib/validations/post'
import type { User } from '@/shared/lib/auth'

// withPermission HOF: リソース・アクションを指定して権限チェックを自動化
export const createPost = withPermission<[CreatePostInput], { id: string }>(
  'post',   // Resource
  'create'  // Action（'create' | 'update' | 'delete' | 'publish' | 'read'）
)(async (_user: User, data: CreatePostInput): Promise<ActionResult<{ id: string }>> => {
  // withPermission が認証・権限チェック・監査ログを処理済み

  // 1. バリデーション
  const validated = postSchema.safeParse(data)
  if (!validated.success) {
    return createFailure('入力内容を確認してください', validated.error.flatten().fieldErrors)
  }

  // 2. DB 操作
  const post = await prisma.post.create({ data: validated.data })

  // 3. キャッシュ即時失効
  updateTag(CACHE_TAGS.POSTS)
  updateTag(getCacheTag.posts.detail(post.slug))

  return createSuccess('投稿を作成しました', { id: post.id })
})
```

### checkPermission パターン（命令型）

HOF が使いにくいケース（条件分岐・複数権限チェックなど）では命令型を使用:

```typescript
'use server'

import { checkPermission, logAction } from '@/admin/lib/action-auth'

export async function publishPost(id: string): Promise<ActionResult> {
  // 1. 権限チェック
  const auth = await checkPermission('post', 'publish')
  if (!auth.success) return auth.error

  const { user } = auth

  // 2. バリデーション・ビジネスロジック
  const post = await prisma.post.findUnique({ where: { id } })
  if (!post) return createFailure('投稿が見つかりません')
  if (post.status === PostStatus.PUBLISHED) return createFailure('すでに公開済みです')

  // 3. DB 操作
  await prisma.post.update({
    where: { id },
    data: { status: PostStatus.PUBLISHED, publishedAt: new Date() },
  })

  // 4. キャッシュ即時失効
  updateTag(CACHE_TAGS.POSTS)
  updateTag(getCacheTag.posts.detail(post.slug))

  // 5. 監査ログ（手動）
  logAction(user.id, 'publish', 'post', id)

  return createSuccess('公開しました')
}
```

### withPermission のオプション

```typescript
export const updatePage = withPermission<[string, PageInput]>(
  'page',
  'update',
  {
    checkResourceAccess: true,  // EDITOR ロールのリソースアクセス制限を有効化
    audit: true,                // 監査ログを記録（デフォルト: create/update/delete/publish で true）
    auditAction: AuditAction.UPDATE,  // 監査アクション種別（省略時は action から自動推定）
  }
)(async (_user: User, id: string, data: PageInput) => {
  // ...
})
```

### ActionResult 型と createSuccess / createFailure

```typescript
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
// または
import { createSuccess, createFailure, type ActionResult } from '@/shared/types/server-actions'

// 成功（データなし）
return createSuccess('保存しました')

// 成功（データあり）
return createSuccess('作成しました', { id: post.id })

// 失敗（エラーメッセージ）
return createFailure('投稿が見つかりません')

// 失敗（フィールドエラー付き）
return createFailure('入力内容を確認してください', {
  title: ['タイトルは必須です'],
  slug: ['スラッグは半角英数字とハイフンのみ使用できます'],
})

// Zod バリデーションエラー → fieldErrors に変換
const validated = schema.safeParse(input)
if (!validated.success) {
  return createFailure('入力内容を確認してください', validated.error.flatten().fieldErrors)
}
```

---

## 公開データ取得パターン（'use cache' + safeFetch + toPlainObject）

認証不要の公開データ取得関数では `safeFetch` + `toPlainObject` を使用:

```typescript
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS, CACHE_LIFE } from '@/shared/lib/constants'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { toPlainObject } from '@/shared/lib/serialize'

export async function getPublicBusinessSettings() {
  'use cache'
  cacheLife(CACHE_LIFE.STATIC_SETTINGS)
  cacheTag(CACHE_TAGS.BUSINESS_SETTINGS, CACHE_TAGS.SETTINGS)

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: { businessName: true, phoneNumber: true, email: true },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPublicBusinessSettings',
  })

  // React 19: Prisma の Symbol プロパティを除去してシリアライズ可能にする
  return toPlainObject(result)
}
```

**なぜ `safeFetch` を使うか**: エラー時に `fallback` を返し、ページ全体のクラッシュを防ぐ。`logger.error` で記録しつつユーザーへのエラー表示を最小化。

**`safeFetch` の結果は必ず `toPlainObject()` でラップしてから返す**。`return safeFetch({...})` と直接返すと `Promise<Prisma結果>` がそのまま漏れ出す（サイレントバグ）:

```typescript
// NG: await せず直接 return（Prisma Symbol プロパティが残り React 19 シリアライゼーションエラー）
async function getSettings() {
  'use cache'
  return safeFetch({ fetch: () => prisma.settings.findUnique({ ... }), fallback: null, ... })
}

// OK: await + toPlainObject でプレーンオブジェクト化
async function getSettings() {
  'use cache'
  const result = await safeFetch({ fetch: () => prisma.settings.findUnique({ ... }), fallback: null, ... })
  return toPlainObject(result)
}
```

---

## キャッシュタグ命名規則

### CACHE_TAGS 定数（必須）

`@/shared/lib/constants/cache.ts` で一元管理。**全 API（cacheTag / updateTag / revalidateTag）で定数使用必須**:

```typescript
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from '@/shared/lib/constants'

// OK: 定数を使用（Next.js 16: revalidateTag は第2引数が必須）
cacheTag(CACHE_TAGS.POSTS)
cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)
updateTag(CACHE_TAGS.POSTS)
revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.PUBLIC_CONTENT)

// NG: マジックストリング（禁止）
cacheTag('posts')
updateTag('settings')
revalidateTag('layout-settings', CACHE_LIFE.PUBLIC_CONTENT)
```

### getCacheTag（階層タグ）

個別アイテムのタグは `getCacheTag` ヘルパーで生成:

```typescript
// タグ付け（キャッシュ関数内）
cacheTag(CACHE_TAGS.POSTS, getCacheTag.posts.detail(slug))

// 無効化（詳細のみ）
updateTag(getCacheTag.posts.detail(slug))

// 無効化（リスト全体）
updateTag(CACHE_TAGS.POSTS)
```

| ヘルパー | 生成タグ例 |
|---------|-----------|
| `getCacheTag.posts.detail(slug)` | `posts-my-post-slug` |
| `getCacheTag.news.detail(id)` | `news-abc123` |
| `getCacheTag.spaces.detail(id)` | `spaces-xyz789` |
| `getCacheTag.pages.detail(slug)` | `pages-about` |
| `getCacheTag.reservations.calendar()` | `reservations-calendar` |

---

## 禁止事項

1. **マジックストリングのタグ名禁止**
   - `cacheTag('posts')` → `cacheTag(CACHE_TAGS.POSTS)`
   - `updateTag('settings')` → `updateTag(CACHE_TAGS.SETTINGS)`
   - `revalidateTag('posts', 'hours')` → `revalidateTag(CACHE_TAGS.POSTS, CACHE_LIFE.PUBLIC_CONTENT)`
   - `cacheLife('hours')` → `cacheLife(CACHE_LIFE.PUBLIC_CONTENT)`

2. **認証チェック漏れ禁止**
   - 管理画面の変更系アクションは必ず `withPermission` HOF または `checkPermission()` を使用
   - 読み取りアクションは `checkReadPermissionFor` を使用

   ```typescript
   // NG: 認証なしで直接 DB 操作
   export async function deletePost(id: string) {
     await prisma.post.delete({ where: { id } })
     return createSuccess('削除しました')
   }
   // OK: withPermission で認証・権限チェック
   export const deletePost = withPermission('post', 'delete')(async (_user, id: string) => {
     await prisma.post.delete({ where: { id } })
     return createSuccess('削除しました')
   })
   ```

3. **エラー握りつぶし禁止**
   - `try { ... } catch {}` — 必ず `createFailure` でエラーを返す
   - エラーは `logger.error` で記録する（`safeFetch` は自動記録）

4. **updateTag を Route Handlers で使用禁止**
   - Route Handlers では `revalidateTag` を使用
   - `updateTag` は Server Actions 内のみ有効

   ```typescript
   // NG: Route Handler 内で updateTag
   export async function POST() {
     await syncCalendar()
     updateTag(CACHE_TAGS.RESERVATIONS)  // 動作しない
     return Response.json({ ok: true })
   }
   // OK: revalidateTag を使用（Next.js 16: 第2引数に CACHE_LIFE プロファイルが必須）
   export async function POST() {
     await syncCalendar()
     revalidateTag(CACHE_TAGS.RESERVATIONS, CACHE_LIFE.DYNAMIC_DATA)
     return Response.json({ ok: true })
   }
   ```

5. **'use cache' 関数内での認証禁止**
   - キャッシュ関数はリクエストをまたいで共有される（全ユーザー共通のキャッシュ）
   - 認証が必要なデータは `'use cache'` なしで取得し、認証チェック後にキャッシュ関数を呼ぶ

   ```typescript
   // NG: 'use cache' 内でセッション取得（全ユーザーが同一キャッシュを共有する）
   async function getMyDraftPosts() {
     'use cache'
     const session = await getSession()  // 危険: キャッシュされた session が別ユーザーに返る
     return await prisma.post.findMany({ where: { authorId: session?.user.id } })
   }
   // OK: 認証チェック後にキャッシュ関数を呼ぶ
   export async function getMyDraftPosts() {
     const session = await getSession()
     if (!session) return []
     return await getCachedDraftPosts(session.user.id)  // ユーザー ID をパラメータで渡す
   }
   ```

6. **Prisma オブジェクトを Client Component に直接渡すことを禁止**
   - `toPlainObject()` / `toPlainArray()` でシリアライズ（React 19 Symbol プロパティ除去）

7. **`'use cache'` 関数内で `safeFetch()` を `await` なし・`toPlainObject()` なしで return 禁止**
   - `return safeFetch({...})` はサイレントバグ（`Promise<PrismaResult>` がシリアライゼーション境界を越える）
   - 必ず `const result = await safeFetch({...}); return toPlainObject(result)` の形式で記述

   ```typescript
   // NG: safeFetch を直接 return（await なし）
   async function getData() {
     'use cache'
     return safeFetch({ fetch: () => prisma.xxx.findUnique({ ... }), fallback: null, ... })
   }

   // NG: await したが toPlainObject なし（Prisma オブジェクトそのままが cached value になる）
   async function getData() {
     'use cache'
     return await safeFetch({ fetch: () => prisma.xxx.findUnique({ ... }), fallback: null, ... })
   }

   // OK: await + toPlainObject（React 19 シリアライゼーション安全）
   async function getData() {
     'use cache'
     const result = await safeFetch({ fetch: () => prisma.xxx.findUnique({ ... }), fallback: null, ... })
     return toPlainObject(result)
   }
   ```

---

## ファイル配置

| パス | 内容 |
|------|------|
| `@/shared/lib/constants/cache.ts` | `CACHE_TAGS`, `CACHE_LIFE`, `getCacheTag` 定数 |
| `@/admin/lib/server-action-helpers.ts` | `withPermission`, `withReadPermission`, `withRole` HOF |
| `@/admin/lib/action-auth.ts` | `checkAdminAuth`, `checkPermission`, `checkResourceAccess`, `logAction` |
| `@/shared/types/server-actions.ts` | `ActionResult`, `ActionSuccess`, `ActionFailure`, `createSuccess`, `createFailure` |
| `@/admin/types/server-actions.ts` | 上記の re-export（admin 用エントリポイント） |
| `@/shared/lib/errors` | `safeFetch`, `ErrorCategory`, `ErrorSeverity` |
| `@/shared/lib/serialize.ts` | `toPlainObject`, `toPlainArray` |
