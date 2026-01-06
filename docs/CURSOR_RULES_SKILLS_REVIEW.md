# `.cursor` Rules & Skills レビューレポート

> **最終更新**: 2026-01-06  
> **目的**: `.cursor/rules`と`.cursor/skills`の内容を最新の公式ベストプラクティスと比較し、改善点を特定

---

## 概要

このレポートは、プロジェクトの`.cursor/rules`と`.cursor/skills`の内容を、`docs/`ディレクトリのドキュメントと最新の公式ベストプラクティス（Context7、Web検索）と比較し、改善点を特定したものです。

**評価基準**:
- 最新の公式ベストプラクティスとの整合性
- プロジェクトの`docs/`ドキュメントとの整合性
- 後方互換性を考慮しないクリーンな実装の原則への準拠
- 実装例の正確性と完全性

---

## 評価結果サマリー

| カテゴリ | ファイル | 評価 | 改善が必要 |
|---------|---------|------|-----------|
| Rules | `code-style/RULE.md` | ✅ 良好 | なし |
| Rules | `testing/RULE.md` | ⚠️ 改善推奨 | Bun test runnerの詳細追加 |
| Rules | `security/RULE.md` | ✅ 良好 | なし |
| Rules | `server-actions/RULE.md` | ⚠️ 改善推奨 | `updateTag()`と`refresh()`の追加 |
| Rules | `components/RULE.md` | ⚠️ 改善推奨 | React 19 Promise passingパターンの追加 |
| Rules | `api-routes/RULE.md` | ✅ 良好 | なし |
| Skills | `nextjs-app-router/SKILL.md` | ⚠️ 改善推奨 | `updateTag()`と`refresh()`の追加 |
| Skills | `prisma-7/SKILL.md` | ✅ 良好 | なし |
| Skills | `authjs-5/SKILL.md` | ✅ 良好 | なし |
| Skills | `bun-runtime/SKILL.md` | ✅ 良好 | なし |
| Skills | `typescript-strict/SKILL.md` | ✅ 良好 | なし |

**総合評価**: 11ファイル中、7ファイルが良好、4ファイルに改善の余地あり

---

## 詳細な改善提案

### 1. `nextjs-app-router/SKILL.md` - Next.js 16 App Router Skill

#### 現状
- `unstable_cache`, `revalidatePath`, `revalidateTag`は記載されている
- `unstable_noStore()`は記載されている

#### 不足している内容
- **`updateTag()`**: タグのタイムスタンプを更新するAPI（Next.js 16の新機能）
- **`refresh()`**: 現在のページのキャッシュを更新するAPI（Next.js 16の新機能）

#### 改善提案

**追加すべきセクション**:

```typescript
### Advanced Cache Invalidation

- **Use `updateTag()`**: For updating tag timestamps without full invalidation
- **Use `refresh()`**: For refreshing the current page cache

```typescript
// ✅ Good: updateTag for granular cache control
'use server'

import { updateTag } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // Update tag timestamp (more granular than revalidateTag)
  updateTag('spaces-list')
}

// ✅ Good: refresh for current page cache
'use server'

import { refresh } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  await prisma.space.update({
    where: { id },
    data,
  })

  // Refresh current page cache
  refresh()
}
```

#### 参照
- `docs/CACHING_STRATEGY.md`の「6. `updateTag`」と「7. `refresh`」セクション
- Context7 Next.js 16ドキュメントの`updateTag()`と`refresh()`の説明

---

### 2. `components/RULE.md` - Component Standards

#### 現状
- Server ComponentsとClient Componentsの基本的な使い分けは記載されている
- Server Componentでのデータフェッチングパターンは記載されている

#### 不足している内容
- **React 19のPromise passingパターン**: Server ComponentからClient ComponentにPromiseを直接渡し、`use()` hookで解決するパターン

#### 改善提案

**追加すべきセクション**:

```typescript
### React 19 Promise Passing Pattern

- **Pass Promises directly**: Server Components can pass Promises to Client Components
- **Use `use()` hook**: Client Components use React 19's `use()` hook to resolve Promises
- **Wrap with Suspense**: Always wrap Promise-consuming Client Components with `<Suspense>`

```typescript
// ✅ Good: Promise passing from Server to Client Component
// Server Component
import { Suspense } from 'react'
import { prisma } from '@/lib/prisma'
import { Comments } from '@/components/blog/comments'

export default async function BlogPostPage({ params }: { params: { slug: string } }) {
  // Critical data: await in Server Component
  const post = await prisma.blogPost.findUnique({
    where: { slug: params.slug, isPublished: true },
  })

  if (!post) {
    notFound()
  }

  // Promise passed directly to Client Component
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

interface CommentsProps {
  commentsPromise: Promise<Comment[]>
}

export function Comments({ commentsPromise }: CommentsProps) {
  const comments = use(commentsPromise)

  return (
    <div>
      {comments.map(comment => (
        <Comment key={comment.id} comment={comment} />
      ))}
    </div>
  )
}
```

#### 参照
- `docs/BEST_PRACTICES.md`の「Promiseを直接Client Componentに渡すパターン」セクション
- React 19公式ドキュメントの`use()` hookの説明

---

### 3. `server-actions/RULE.md` - Server Actions Standards

#### 現状
- `revalidatePath()`と`revalidateTag()`は記載されている
- キャッシュ無効化の基本的なパターンは記載されている

#### 不足している内容
- **`updateTag()`**: タグのタイムスタンプを更新するAPI
- **`refresh()`**: 現在のページのキャッシュを更新するAPI

#### 改善提案

**追加すべきセクション**:

```typescript
## Advanced Cache Invalidation

- **Use `updateTag()`**: For updating tag timestamps without full invalidation
- **Use `refresh()`**: For refreshing the current page cache

```typescript
import { revalidatePath, revalidateTag, updateTag, refresh } from 'next/cache'

export async function updateSpace(id: string, data: UpdateSpaceData) {
  // ... database operation ...

  // Option 1: Revalidate specific paths
  revalidatePath('/spaces')
  revalidatePath(`/spaces/${id}`)

  // Option 2: Revalidate by tag
  revalidateTag('spaces-list')

  // Option 3: Update tag timestamp (more granular)
  updateTag('spaces-list')

  // Option 4: Refresh current page cache
  refresh()
}
```

#### 参照
- `docs/CACHING_STRATEGY.md`の「6. `updateTag`」と「7. `refresh`」セクション
- Context7 Next.js 16ドキュメント

---

### 4. `testing/RULE.md` - Testing Standards

#### 現状
- Bun test runnerの基本的な使用方法は記載されている
- テスト構造とコマンドは記載されている

#### 不足している内容
- **Bun test runnerの`mock()`と`spyOn()`**: Bun 1.3.5のネイティブなモックとスパイ機能の詳細な説明
- **ライフサイクルフック**: `beforeAll`, `beforeEach`, `afterEach`, `afterAll`の使用例

#### 改善提案

**追加すべきセクション**:

```typescript
## Bun Test Runner Mocking and Spying

- **Use `mock()`**: For creating mock functions
- **Use `spyOn()`**: For monitoring calls to existing functions without replacing them
- **Reset mocks**: Always reset mocks between tests for isolation

```typescript
// ✅ Good: Function mocks with Bun test runner
import { test, expect, mock } from 'bun:test'

const random = mock(() => Math.random())

test('random', () => {
  const val = random()
  expect(val).toBeGreaterThan(0)
  expect(random).toHaveBeenCalled()
  expect(random).toHaveBeenCalledTimes(1)
})

// ✅ Good: Spies for monitoring function calls
import { test, expect, spyOn } from 'bun:test'

const service = {
  fetchData() {
    // Original implementation
  },
}

const spy = spyOn(service, 'fetchData')

test('fetchData is called', () => {
  service.fetchData()
  expect(spy).toHaveBeenCalled()
  expect(spy.mock.calls).toEqual([[]])
})

// ✅ Good: Lifecycle hooks for setup and teardown
import { beforeAll, beforeEach, afterEach, afterAll } from 'bun:test'

beforeAll(() => {
  // Setup before all tests
})

beforeEach(() => {
  // Setup before each test
})

afterEach(() => {
  // Cleanup after each test
  // Reset mocks for isolation
})

afterAll(() => {
  // Cleanup after all tests
})
```

#### 参照
- Bun公式ドキュメントの`mock()`と`spyOn()`の説明
- `docs/TEST_REQUIREMENTS.md`のBun test runnerセクション

---

## 実装優先度

### 高優先度（即座に実装推奨）
1. ✅ `nextjs-app-router/SKILL.md` - `updateTag()`と`refresh()`の追加
2. ✅ `components/RULE.md` - React 19 Promise passingパターンの追加

### 中優先度（近日中に実装推奨）
3. ✅ `server-actions/RULE.md` - `updateTag()`と`refresh()`の追加
4. ✅ `testing/RULE.md` - Bun test runnerの詳細な説明の追加

---

## 整合性チェック

### プロジェクトドキュメントとの整合性
- ✅ `docs/CACHING_STRATEGY.md`に`updateTag()`と`refresh()`が記載されている → Skills/Rulesにも追加が必要
- ✅ `docs/BEST_PRACTICES.md`にReact 19 Promise passingパターンが記載されている → Components Ruleにも追加が必要
- ✅ `docs/TEST_REQUIREMENTS.md`にBun test runnerの説明がある → Testing Ruleにも詳細な説明が必要

### 最新の公式ベストプラクティスとの整合性
- ✅ Context7 Next.js 16ドキュメントに`updateTag()`と`refresh()`が記載されている
- ✅ React 19公式ドキュメントに`use()` hookとPromise passingパターンが記載されている
- ✅ Bun公式ドキュメントに`mock()`と`spyOn()`の詳細な説明がある

---

## 結論

`.cursor/rules`と`.cursor/skills`の内容は全体的に良好ですが、以下の4つのファイルに改善の余地があります：

1. **`nextjs-app-router/SKILL.md`**: Next.js 16の新機能（`updateTag()`, `refresh()`）を追加
2. **`components/RULE.md`**: React 19のPromise passingパターンを追加
3. **`server-actions/RULE.md`**: 高度なキャッシュ無効化API（`updateTag()`, `refresh()`）を追加
4. **`testing/RULE.md`**: Bun test runnerの詳細な説明（`mock()`, `spyOn()`, ライフサイクルフック）を追加

これらの改善により、プロジェクトのルールとスキルが最新の公式ベストプラクティスと完全に整合し、開発者が最新の機能を適切に使用できるようになります。

---

## 実装完了状況

**実装日**: 2026-01-06

### ✅ 完了した改善

1. ✅ **`nextjs-app-router/SKILL.md`**: `updateTag()`と`refresh()`の詳細な説明と例を追加
   - Advanced Cache Invalidationセクションを追加
   - 4つのキャッシュ無効化方法の比較例を追加
   - Best Practicesに高度なキャッシュ制御を追加

2. ✅ **`components/RULE.md`**: React 19のPromise passingパターン（`use` hook）を追加
   - React 19 Promise Passing Patternセクションを追加
   - Server ComponentからClient ComponentへのPromise渡しの例を追加
   - Suspense境界の使用例を追加

3. ✅ **`server-actions/RULE.md`**: `updateTag()`と`refresh()`の使用例を追加
   - Cache Invalidationセクションに`updateTag()`と`refresh()`を追加
   - 4つのキャッシュ無効化方法の比較例を追加

4. ✅ **`testing/RULE.md`**: Bun test runnerの詳細な説明（`mock()`, `spyOn()`, ライフサイクルフック）を追加
   - Bun Test Runner Mocking and Spyingセクションを追加
   - `mock()`と`spyOn()`の使用例を追加
   - ライフサイクルフック（`beforeAll`, `beforeEach`, `afterEach`, `afterAll`）の使用例を追加
   - Test ExampleをBun test runnerのAPIに更新

### 📊 最終評価

| カテゴリ | ファイル | 評価 | 状態 |
|---------|---------|------|------|
| Rules | `code-style/RULE.md` | ✅ 良好 | 変更なし |
| Rules | `testing/RULE.md` | ✅ 改善完了 | ✅ 更新済み |
| Rules | `security/RULE.md` | ✅ 良好 | 変更なし |
| Rules | `server-actions/RULE.md` | ✅ 改善完了 | ✅ 更新済み |
| Rules | `components/RULE.md` | ✅ 改善完了 | ✅ 更新済み |
| Rules | `api-routes/RULE.md` | ✅ 良好 | 変更なし |
| Skills | `nextjs-app-router/SKILL.md` | ✅ 改善完了 | ✅ 更新済み |
| Skills | `prisma-7/SKILL.md` | ✅ 良好 | 変更なし |
| Skills | `authjs-5/SKILL.md` | ✅ 良好 | 変更なし |
| Skills | `bun-runtime/SKILL.md` | ✅ 良好 | 変更なし |
| Skills | `typescript-strict/SKILL.md` | ✅ 良好 | 変更なし |

**総合評価**: 11ファイルすべてが最新の公式ベストプラクティスに準拠 ✅

---

## 次のステップ

1. ✅ 上記の4つのファイルを更新 - **完了**
2. ✅ 更新後の内容を`docs/`ドキュメントと再確認 - **完了**
3. 実装例を実際のコードベースで検証（開発時に実施）
4. 必要に応じて追加の改善を実施（現時点では不要）
