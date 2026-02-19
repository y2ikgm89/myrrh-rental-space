# 公式ベストプラクティス準拠クリーンアップ 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 7ファイルの Server Actions を公式ベストプラクティス（withPermission HOF + canonical ActionResult）に統一し、Zod 4 deprecated API と型アサーションを修正する

**Architecture:** 既存の `withPermission` / `withReadPermission` HOF パターン（news.ts が正規実装例）に全 Server Actions を統一。ローカル型定義を削除し `@/admin/types/server-actions` の canonical 型に集約。

**Tech Stack:** Next.js 16.1.6 / TypeScript 6.0-beta / Zod 4.3.6 / Prisma 7.4 / Better Auth 1.4

---

## Task 1: Zod 4 deprecated API 修正（block-template.ts, ical-tokens.ts）

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/block-template.ts:122`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/ical-tokens.ts:83`

**Step 1: block-template.ts — `z.flattenError` → `createValidationError`**

```typescript
// 現在（line 122）:
return createFailure(z.flattenError(validated.error).formErrors[0] ?? 'バリデーションエラー')

// 修正後:
return createValidationError(validated.error)
```

`createValidationError` は `@/shared/lib/action-helpers` から既に import 済みか確認。なければ追加。

**Step 2: ical-tokens.ts — `.error.flatten().fieldErrors` → `createValidationError`**

```typescript
// 現在（line 83）:
return createFailure('入力が不正です', parsed.error.flatten().fieldErrors)

// 修正後:
return createValidationError(parsed.error)
```

`createValidationError` の import を追加:
```typescript
import { createValidationError } from '@/shared/lib/action-helpers'
```

**Step 3: 検証**

Run: `bun run type-check`

**Step 4: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/block-template.ts \
       src/app/(admin)/admin/(dashboard)/_shared/actions/ical-tokens.ts
git commit -m "fix: replace Zod 4 deprecated flatten/flattenError with createValidationError"
```

---

## Task 2: TagInput.tsx 型アサーション修正

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/TagInput.tsx:212-218`

**Step 1: `e.target as Node` → `instanceof` 型ガード**

```typescript
// 現在（line 212-218）:
const handleClickOutside = (e: MouseEvent) => {
  if (
    containerRef.current &&
    !containerRef.current.contains(e.target as Node)
  ) {
    setIsOpen(false)
  }
}

// 修正後:
const handleClickOutside = (e: MouseEvent) => {
  if (
    containerRef.current &&
    e.target instanceof Node &&
    !containerRef.current.contains(e.target)
  ) {
    setIsOpen(false)
  }
}
```

**Step 2: 検証**

Run: `bun run type-check`

**Step 3: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/components/editor/inline/side-panel/TagInput.tsx
git commit -m "fix: replace type assertion with instanceof type guard in TagInput"
```

---

## Task 3: media.ts import パス修正

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts:25`

**Step 1: import パスを `@/shared` → `@/admin` に修正**

```typescript
// 現在（line 25）:
import { createSuccess, createFailure, type ActionResult } from '@/shared/types/server-actions'

// 修正後:
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
```

**Step 2: 検証**

Run: `bun run type-check`

**Step 3: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts
git commit -m "fix: correct import path for ActionResult in media.ts to @/admin"
```

---

## Task 4: fetch-ogp.ts — withPermission + canonical ActionResult

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/fetch-ogp.ts`

**破壊的変更:**
- `FetchOgpResult` 型削除 → `ActionResult<OgpData>`
- 成功レスポンスに `message` フィールド追加
- **BookmarkPlugin.tsx は変更不要**（`.data` / `.error` アクセスパターンは canonical ActionResult と互換）

**Step 1: import セクション書き換え**

```typescript
'use server'

import { z } from 'zod'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
```

`checkAdminAuth` import を削除。

**Step 2: `FetchOgpResult` 型を削除**

Lines 19-21 の `type FetchOgpResult = ...` を完全削除。`OgpData` 型は export のまま保持。

**Step 3: `fetchOgp` 関数を withPermission でラップ**

```typescript
export const fetchOgp = withPermission<[string], OgpData>(
  'media',
  'read',
  { audit: false }
)(async (_user, url) => {
  // バリデーション
  const validated = urlSchema.safeParse(url)
  if (!validated.success) {
    return createFailure('有効なURLを入力してください')
  }

  // SSRF対策: URLの安全性を検証
  const safetyCheck = isUrlSafe(url)
  if (!safetyCheck.safe) {
    return createFailure(safetyCheck.error ?? 'URLの検証に失敗しました')
  }

  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; BookmarkBot/1.0)',
        Accept: 'text/html,application/xhtml+xml',
      },
      signal: AbortSignal.timeout(10000),
    })

    if (!response.ok) {
      return createFailure(`URLの取得に失敗しました: ${response.status}`)
    }

    const html = await response.text()

    const title = extractTitle(html)
    const description = extractDescription(html)
    const imageUrlRaw = extractImage(html)
    const imageUrl = resolveUrl(url, imageUrlRaw)
    const faviconUrl = getFaviconUrl(url, html)
    const siteName = extractSiteName(html)

    return createSuccess('OGP情報を取得しました', {
      url,
      title,
      description,
      imageUrl,
      faviconUrl,
      siteName,
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') {
      return createFailure('URLの取得がタイムアウトしました')
    }
    return createFailure('URLの取得に失敗しました')
  }
})
```

**Step 4: 検証**

Run: `bun run type-check`

BookmarkPlugin.tsx (`result.success`, `result.data`, `result.error`) は canonical ActionResult<OgpData> と互換のため変更不要。

**Step 5: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/fetch-ogp.ts
git commit -m "refactor(fetch-ogp): migrate to withPermission HOF and canonical ActionResult"
```

---

## Task 5: editor-comment.ts — ローカル ActionResult 削除 + withPermission

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts`

**破壊的変更:**
- ローカル `ActionResult<T>` 型削除（line 58-60）
- 成功レスポンスに `message` フィールド追加
- void 操作: `{ success: true, data: undefined }` → `{ success: true, message: '...' }`

**Step 1: import セクション書き換え**

```typescript
'use server'

// ... (既存 JSDoc コメント保持)

import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import type { EditorCommentStatus } from '@/shared/generated/prisma/client'
import type {
  EditorCommentThread,
  EditorComment,
  CreateThreadInput,
  AddCommentInput,
  GetThreadsQuery,
  ThreadListItem,
  MarkInfo,
  CommentableContentType,
} from '@/admin/types/editor-comment'
import { isCommentableContentType } from '@/admin/types/editor-comment'
import { createValidationError } from '@/shared/lib/action-helpers'
import { z } from 'zod/v4'
import { withPermission, withReadPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
```

`verifyAdminSession` import を削除。

**Step 2: ローカル `ActionResult<T>` 型を削除**

Lines 54-61 の Result Types セクションを完全削除:

```typescript
// 削除:
// export type ActionResult<T = void> =
//   | { success: true; data: T }
//   | { success: false; error: string }
```

**Step 3: Write 操作を withPermission に移行**

各関数を `withPermission('post', 'update')` でラップ。例（createCommentThread）:

```typescript
export const createCommentThread = withPermission<
  [CreateThreadInput],
  EditorCommentThread
>('post', 'update')(async (user, input) => {
  const validation = createThreadSchema.safeParse(input)
  if (!validation.success) {
    return createValidationError(validation.error)
  }

  const { markId, contentType, contentId, quotedText, initialComment } = validation.data

  try {
    const existingThread = await prisma.editorCommentThread.findUnique({
      where: { markId_contentType_contentId: { markId, contentType, contentId } },
      select: { id: true },
    })

    if (existingThread) {
      return createFailure('このマークには既にコメントスレッドが存在します')
    }

    const thread = await prisma.editorCommentThread.create({
      data: {
        markId,
        contentType,
        contentId,
        quotedText,
        createdBy: user.id,
        comments: {
          create: { content: initialComment, createdBy: user.id },
        },
      },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true, threadId: true, content: true, isDeleted: true,
            deletedAt: true, deletedBy: true, createdAt: true, updatedAt: true, createdBy: true,
          },
        },
      },
    })

    return createSuccess('コメントスレッドを作成しました', toEditorCommentThread(thread))
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createCommentThread', contentType, contentId },
    })
    return createFailure('コメントスレッドの作成中にエラーが発生しました')
  }
})
```

同様に以下の関数もラップ:

| 関数 | HOF | 変更点 |
|------|-----|--------|
| `addComment` | `withPermission<[AddCommentInput], EditorComment>('post', 'update')` | `user.id` は HOF 引数から取得 |
| `resolveThread` | `withPermission<[string], void>('post', 'update')` | `return createSuccess('スレッドを解決しました')` |
| `reopenThread` | `withPermission<[string], void>('post', 'update')` | `return createSuccess('スレッドを再オープンしました')` |
| `deleteThread` | `withPermission<[string], void>('post', 'delete')` | `return createSuccess('スレッドを削除しました')` |
| `deleteComment` | `withPermission<[string], void>('post', 'delete')` | `user.id` は HOF 引数から取得 |

**Step 4: Read 操作を withReadPermission に移行**

Read 操作は `withReadPermission('post')` でラップ。戻り値型は `ActionResult<T> | ActionFailure` になるが、`ActionFailure` は `ActionResult` のサブタイプなので実質同じ。

ただし、read 操作は現在 `ActionResult<T>` を返しているため、`withReadPermission` ではなく内部の `verifyAdminSession()` パターンを維持し、戻り値を canonical `ActionResult<T>` に変更する方が安全。

**実装方針**: Read 操作は `withPermission` with `{ audit: false }` を使用:

```typescript
export const getCommentThreads = withPermission<
  [GetThreadsQuery],
  ThreadListItem[]
>('post', 'read', { audit: false })(async (_user, query) => {
  const { contentType, contentId, status } = query

  if (!isCommentableContentType(contentType)) {
    return createFailure('無効なコンテンツタイプです')
  }

  try {
    const threads = await prisma.editorCommentThread.findMany({
      // ... 既存クエリ
    })

    // ... ユーザー情報取得ロジック

    return createSuccess('スレッド一覧を取得しました', items.map(toThreadListItem))
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getCommentThreads', contentType, contentId },
    })
    return createFailure('スレッド一覧の取得中にエラーが発生しました')
  }
})
```

| 関数 | HOF |
|------|-----|
| `getCommentThreads` | `withPermission<[GetThreadsQuery], ThreadListItem[]>('post', 'read', { audit: false })` |
| `getThreadDetail` | `withPermission<[string], EditorCommentThread>('post', 'read', { audit: false })` |
| `getMarkInfoList` | `withPermission<[CommentableContentType, string], MarkInfo[]>('post', 'read', { audit: false })` |

**Step 5: 検証**

Run: `bun run type-check`

**Step 6: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts
git commit -m "refactor(editor-comment): migrate to withPermission HOF and canonical ActionResult"
```

---

## Task 6: post-comment.ts — カスタム型削除 + withPermission

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post-comment.ts`

**破壊的変更:**
- `AdminCommentActionResult` 型削除 → `ActionResult`
- `BulkDeleteResult` 型削除 → `ActionResult<{ count: number }>`

**Step 1: import セクション書き換え**

```typescript
'use server'

// ... (既存 JSDoc コメント保持)

import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { toCommentAuthor, type CommentAuthor } from '@/shared/lib/validations/comment'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { withPermission, withReadPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
```

`verifyAdminSession` import を削除。

**Step 2: カスタム型を削除**

Lines 64-70 を完全削除:

```typescript
// 削除:
// export type AdminCommentActionResult = ...
// export type BulkDeleteResult = ...
```

**Step 3: Read 操作の書き換え**

Read 操作は plain 型を返すため `verifyAdminSession()` パターンを維持（`withReadPermission` は戻り値型が変わるため caller 変更が必要になる。スコープ外）。

ただし `verifyAdminSession` import が削除されるので、read 操作は `withReadPermission` に移行する:

```typescript
export const getAdminComments = withReadPermission<
  [CommentFilters, { page?: number; limit?: number }],
  GetCommentsResult
>('post')(async (_user, filters = {}, pagination = {}) => {
  // ... 既存ロジック（verifyAdminSession() 行を削除）
})

export const getCommentStats = withReadPermission<[], CommentStats>(
  'post'
)(async () => {
  // ... 既存ロジック
})

export const getCommentCountByPost = withReadPermission<[string], number>(
  'post'
)(async (_user, postId) => {
  // ... 既存ロジック
})
```

**注意**: `withReadPermission` は `TReturn | ActionFailure` を返す。呼び出し側で `'success' in result && !result.success` チェックが必要になる場合がある。

**Step 4: Write 操作を withPermission に移行**

```typescript
export const deleteCommentAdmin = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, commentId) => {
  try {
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: { id: true, post: { select: { slug: true } } },
    })

    if (!comment) {
      return createFailure('コメントが見つかりません')
    }

    await prisma.postComment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date(), deletedBy: user.id },
    })

    updateTag(CACHE_TAGS.POST_COMMENTS)
    updateTag(getCacheTag.posts.comments(comment.post.slug))

    return createSuccess('コメントを削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteCommentAdmin', commentId },
    })
    return createFailure('コメントの削除中にエラーが発生しました')
  }
})
```

| 関数 | HOF | 戻り値 |
|------|-----|--------|
| `deleteCommentAdmin` | `withPermission<[string], void>('post', 'delete')` | `ActionResult` |
| `deleteCommentsAdmin` | `withPermission<[string[]], { count: number }>('post', 'delete')` | `ActionResult<{ count: number }>` |
| `restoreCommentAdmin` | `withPermission<[string], void>('post', 'update')` | `ActionResult` |

`deleteCommentsAdmin` の成功レスポンス:
```typescript
return createSuccess(`${result.count}件のコメントを削除しました`, { count: result.count })
```

**Step 5: 検証**

Run: `bun run type-check`

**Step 6: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/post-comment.ts
git commit -m "refactor(post-comment): migrate to withPermission HOF, remove custom result types"
```

---

## Task 7: page.ts — withPermission + createSuccess/createFailure 統一

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts`

**これが最大のファイル（867行、18関数）。Write 操作を withPermission に、エラー処理を統一。**

**Step 1: import セクション書き換え**

```typescript
'use server'

// ... (既存 JSDoc コメント保持)

import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { purgePageCache } from '@/shared/lib/cloudflare'
import { fireAndForget } from '@/shared/lib/async-utils'
import { checkSlugAvailability, getSlugErrorMessage } from '@/shared/lib/slug-validation'
import { toPlainObject, toPlainArray } from '@/shared/lib/serialize'
import {
  updatePageSchema,
  updatePageSeoSchema,
  createPageSchema,
  isSystemPageSlug,
  getSystemPageDefinition,
  type UpdatePageInput,
  type UpdatePageSeoInput,
  type CreatePageInput,
} from '@/shared/lib/validations/page'
import type { PageModel as PageData } from '@/shared/generated/prisma/models/Page'
import type { Prisma } from '@/shared/generated/prisma/client'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure, type ActionResult } from '@/admin/types/server-actions'
import { createValidationError } from '@/shared/lib/action-helpers'
import { verifyAdminSession } from '@/shared/lib/auth'
```

**注意**: `verifyAdminSession` は read 操作と内部ヘルパーで引き続き使用するため import を保持。

**Step 2: Write 操作を withPermission に移行**

### updatePage

```typescript
export const updatePage = withPermission<[string, UpdatePageInput], void>(
  'page',
  'update'
)(async (_user, slug, input) => {
  const parsed = updatePageSchema.safeParse(input)
  if (!parsed.success) {
    return createValidationError(parsed.error)
  }

  try {
    const existingPage = await prisma.page.findUnique({
      where: { slug },
      select: { id: true },
    })

    if (!existingPage) {
      return createFailure('ページが見つかりません')
    }

    await prisma.page.update({
      where: { slug },
      data: {
        title: parsed.data.title,
        description: parsed.data.description || null,
        metaDescription: parsed.data.metaDescription || null,
        metaKeywords: parsed.data.metaKeywords || null,
        ogpTitle: parsed.data.ogpTitle || null,
        ogpDescription: parsed.data.ogpDescription || null,
        ogpImageUrl: parsed.data.ogpImageUrl || null,
        isPublished: parsed.data.isPublished,
        publishedAt: parsed.data.publishedAt || null,
        contentWidth: parsed.data.contentWidth ?? null,
        contentWidthCustom: parsed.data.contentWidthCustom ?? null,
        showSidebar: parsed.data.showSidebar ?? null,
      },
    })

    updateTag(CACHE_TAGS.PAGES)
    updateTag(getCacheTag.pages.detail(slug))
    fireAndForget(purgePageCache(slug), { operation: 'purgePageCache', category: ErrorCategory.EXTERNAL_API, severity: ErrorSeverity.LOW })

    return createSuccess('ページを更新しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'updatePage', slug },
    })
    return createFailure('ページの更新中にエラーが発生しました')
  }
})
```

### 全 Write 操作の対応表

| 関数 | HOF | バリデーション | 備考 |
|------|-----|---------------|------|
| `updatePage` | `withPermission<[string, UpdatePageInput], void>('page', 'update')` | `createValidationError(parsed.error)` | 手動 fieldErrors 構築を削除 |
| `createPage` | `withPermission<[CreatePageInput], { slug: string }>('page', 'create')` | `createValidationError(parsed.error)` | |
| `deletePage` | `withPermission<[string], void>('page', 'delete')` | — | システムページチェック保持 |
| `deletePagePermanently` | `withPermission<[string], void>('page', 'delete')` | — | |
| `restorePage` | `withPermission<[string], void>('page', 'update')` | — | |
| `togglePagePublished` | `withPermission<[string], void>('page', 'publish')` | — | |
| `bulkTogglePagePublished` | `withPermission<[string[], boolean], void>('page', 'publish')` | — | |
| `bulkDeletePages` | `withPermission<[string[]], void>('page', 'delete')` | — | |
| `updatePageSeo` | `withPermission<[string, UpdatePageSeoInput], void>('page', 'update')` | `createValidationError(parsed.error)` | 手動 fieldErrors 構築を削除 |

**共通パターン**（全 Write 操作で統一）:

```typescript
// バリデーション: 手動 fieldErrors 構築 → createValidationError
// BEFORE:
const fieldErrors: Record<string, string[]> = {}
for (const error of parsed.error.issues) {
  const field = error.path.join('.')
  if (!fieldErrors[field]) fieldErrors[field] = []
  fieldErrors[field].push(error.message)
}
return { success: false, error: 'バリデーションエラー', fieldErrors }

// AFTER:
return createValidationError(parsed.error)

// 成功レスポンス: オブジェクトリテラル → createSuccess
// BEFORE:
return { success: true, message: 'ページを更新しました' }

// AFTER:
return createSuccess('ページを更新しました')

// 失敗レスポンス: オブジェクトリテラル → createFailure
// BEFORE:
return { success: false, error: 'ページが見つかりません' }

// AFTER:
return createFailure('ページが見つかりません')
```

**Step 3: Read 操作と内部ヘルパーは verifyAdminSession() を維持**

以下の関数は `verifyAdminSession()` をそのまま使用（戻り値が plain 型のため withReadPermission への変更は caller に破壊的変更を要求）:

- `getHomepageLastUpdated` — 変更なし
- `getPagesList` — 変更なし
- `getPageBySlug` — 変更なし
- `getPageForPublic` — 変更なし（公開用、認証なし）
- `createPageIfNotExists` — 変更なし（内部ヘルパー）
- `ensureSystemPage` — 変更なし（内部ヘルパー）
- `checkPageSlugAvailability` — 変更なし
- `getDeletedPagesList` — 変更なし
- `getSystemPagesList` — 変更なし

**Step 4: 検証**

Run: `bun run type-check`

**Step 5: コミット**

```bash
git add src/app/(admin)/admin/(dashboard)/_shared/actions/page.ts
git commit -m "refactor(page): migrate write operations to withPermission HOF and canonical ActionResult"
```

---

## Task 8: caller 影響確認・更新

**Files:** 各 action ファイルの呼び出し元

**Step 1: 破壊的変更の caller を検索**

```bash
# editor-comment.ts の呼び出し元
rg "from.*actions/editor-comment" --type ts --type tsx

# post-comment.ts の呼び出し元
rg "from.*actions/post-comment" --type ts --type tsx

# fetch-ogp.ts の呼び出し元（BookmarkPlugin.tsx — 互換性確認済み）
rg "from.*actions/fetch-ogp" --type ts --type tsx
```

**Step 2: 各 caller の影響を評価**

| 変更ファイル | 主な破壊的変更 | caller 対応 |
|-------------|---------------|------------|
| `fetch-ogp.ts` | `FetchOgpResult` → `ActionResult<OgpData>` | BookmarkPlugin: `.data`/`.error` 互換 → **変更不要** |
| `editor-comment.ts` | ローカル `ActionResult<T>` 削除, `.message` 追加 | 各 caller で `result.message` を活用可能（additive change） |
| `post-comment.ts` | `AdminCommentActionResult` 削除, `BulkDeleteResult` 削除 | `AdminCommentActionResult` を使用していた caller は `ActionResult` に変更 |
| `post-comment.ts` | `BulkDeleteResult.count` → `ActionResult<{ count: number }>.data.count` | `result.count` → `result.data?.count` に変更 |
| `page.ts` | 構造変更なし（既に ActionResult 互換） | **変更不要** |

**Step 3: 型エラーが出た caller を修正**

post-comment.ts の `BulkDeleteResult` を使用していた caller:

```typescript
// BEFORE:
const result = await deleteCommentsAdmin(ids)
if (result.success) {
  toast.success(`${result.count}件削除しました`)
}

// AFTER:
const result = await deleteCommentsAdmin(ids)
if (result.success) {
  toast.success(result.message)
  // count が必要なら: result.data?.count
}
```

post-comment.ts の `AdminCommentActionResult` を import していた caller:

```typescript
// BEFORE:
import type { AdminCommentActionResult } from '@/admin/actions/post-comment'

// AFTER:
import type { ActionResult } from '@/admin/types/server-actions'
```

**Step 4: 検証**

Run: `bun run type-check`

**Step 5: コミット**

```bash
git add -A
git commit -m "fix: update callers for post-comment and editor-comment ActionResult changes"
```

---

## Task 9: 最終検証

**Step 1: 型チェック + リント**

Run: `bun run validate`

Expected: PASS

**Step 2: ビルド**

Run: `bun run build`

Expected: SUCCESS（Prisma ランタイムエラーは DB 未接続のため許容。ページ生成 96/96 完了が基準）

**Step 3: 確認チェックリスト**

- [ ] `z.flattenError()` / `.flatten()` の使用箇所が 0
- [ ] ローカル `ActionResult` 型定義が 0（editor-comment.ts のもの削除済み）
- [ ] `AdminCommentActionResult` / `BulkDeleteResult` / `FetchOgpResult` 型が 0
- [ ] `e.target as Node` の使用が 0
- [ ] media.ts の import が `@/admin/types/server-actions` に修正済み
- [ ] 全 write 操作で `withPermission` HOF 使用
- [ ] 全バリデーションエラーで `createValidationError()` 使用
- [ ] 全成功/失敗レスポンスで `createSuccess()`/`createFailure()` 使用

**Step 4: コミット（必要に応じて）**

```bash
git add -A
git commit -m "verify: all official best practices cleanup completed"
```

---

## スコープ外（変更なし）

| ファイル | 理由 |
|---------|------|
| `audit-log.ts` | 既に `createSuccess`/`createFailure` 使用。カスタム `checkAuditLogPermission` は監査ログ特有の要件で適切 |
| `dashboard.ts` | read-only 操作で `verifyAdminSession()` は適切。`withReadPermission` への変更は caller に破壊的変更を要求するため別タスクとする |
| Lexical カラープリセット | カラーピッカースウォッチ — tailwind-patterns.md 例外 |
| `bg-black/80` オーバーレイ | shadcn/ui 公式パターン |
| Stripe ブランドカラー | ブランドガイドライン色 |
