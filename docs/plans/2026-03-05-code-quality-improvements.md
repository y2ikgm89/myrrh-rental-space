# Code Quality Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** プロジェクト品質スコア向上のため、Prisma select最適化・大規模ファイル分割・README更新を実施する。

**Architecture:**

- Prisma `findMany` に `select` を追加してフェッチフィールドを明示化（list クエリでは大きなテキスト列を除外）
- 1000行超のアクションファイルをサブディレクトリ（queries.ts + mutations.ts）に分割し、barrel index.ts で再エクスポート
- README の技術スタックバージョン情報を最新化

**Tech Stack:** Next.js 16.1.6 / Prisma 7 WASM / TypeScript 6.0-beta / `bun:test`

---

## 前提知識

### ファイル分割パターン

```
src/app/(admin)/admin/(dashboard)/_shared/actions/
├── post.ts           ← 分割前 (1052行)
└── post/             ← 分割後
    ├── queries.ts    # getPosts, getPostById, getPostVersionHistory, getPostCategories, getPostTags
    ├── mutations.ts  # createPost, updatePost, deletePost, publishPost, ...
    └── index.ts      # barrel: export * from './queries'; export * from './mutations'
```

barrel の `index.ts` に `"use server"` は不要（queries.ts と mutations.ts に記述済み）。
import パスは `from '@/admin/actions/post'` → 変更なし（barrel で透過）。

**注意**: MINGW64 では `()` 含むパスをシェルに渡さないこと。`Glob`/`Grep`/`Read`/`Edit` ツールを使用。

### Prisma select パターン

```typescript
// Before: select なし（全列取得）
const items = await prisma.announcementBar.findMany({
  orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
});

// After: select で明示化（AnnouncementBarData 型と一致）
const items = await prisma.announcementBar.findMany({
  select: {
    id: true,
    message: true,
    type: true,
    linkUrl: true,
    linkText: true,
    bgColor: true,
    textColor: true,
    isActive: true,
    priority: true,
    startAt: true,
    endAt: true,
    createdAt: true,
    updatedAt: true,
  },
  orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
});
```

`include` と `select` はトップレベルで同時使用不可。`include` を使っている箇所は `select` に移行し、
リレーションは `select` 内でネストする。

### 検証コマンド

```bash
bun run validate          # type-check + lint
bun run test              # 単体テスト
bun run validate && bun run build  # コミット前
```

---

## Task 1: README バージョン情報更新

**Files:**

- Modify: `README.md`

### Step 1: README を読む

`README.md` の技術スタックテーブルを確認する。

### Step 2: バージョンを更新する

テーブル内の以下のバージョンを更新する:

| 技術       | 現在   | 更新後   |
| ---------- | ------ | -------- |
| Next.js    | 16.1.1 | 16.1.6   |
| React      | 19.2.3 | 19.2.4   |
| TypeScript | 5.9.3  | 6.0-beta |

`README.md` の該当行（約9〜11行目）を `Edit` ツールで更新する。

### Step 3: 検証してコミット

```bash
# 型チェック・lint は不要（.md ファイルのみ）
git add README.md
git commit -m "docs: update technology stack versions in README"
```

---

## Task 2: announcement-bar.ts の findMany に select を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/announcement-bar.ts`

### Step 1: ファイルを読む

`announcement-bar.ts` 全体を Read ツールで確認する。

### Step 2: select を追加する

**変更箇所1 — `getAnnouncementBars`（L79）:**

`replace_content` または `Edit` ツールで変更:

```typescript
// Before
const items = await prisma.announcementBar.findMany({
  orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
});

// After
const items = await prisma.announcementBar.findMany({
  select: {
    id: true,
    message: true,
    type: true,
    linkUrl: true,
    linkText: true,
    bgColor: true,
    textColor: true,
    isActive: true,
    priority: true,
    startAt: true,
    endAt: true,
    createdAt: true,
    updatedAt: true,
  },
  orderBy: [{ priority: "desc" }, { createdAt: "desc" }],
});
```

**変更箇所2 — `getActiveAnnouncementBars`（L102）:**

```typescript
// Before
const bars = await prisma.announcementBar.findMany({
  where: { isActive: true },
  orderBy: [...],
})

// After
const bars = await prisma.announcementBar.findMany({
  where: { isActive: true },
  select: {
    id: true, message: true, type: true, linkUrl: true, linkText: true,
    bgColor: true, textColor: true, isActive: true, priority: true,
    startAt: true, endAt: true, createdAt: true, updatedAt: true,
  },
  orderBy: [...],
})
```

### Step 3: 型チェック

```bash
bun run type-check
```

Expected: エラーなし（AnnouncementBarData 型と select フィールドが一致）

### Step 4: コミット

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/announcement-bar.ts
git commit -m "perf(db): add explicit select to announcementBar findMany"
```

---

## Task 3: 複数の単純モデルに select を追加（バッチ）

以下のファイルの `findMany` に `select` を追加する。各ファイルで同じパターンを適用。

**Files:**

- `src/app/(admin)/admin/(dashboard)/_shared/actions/coupon.ts` (L279)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/faq.ts` (L70, L300)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/ical-tokens.ts` (L52)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts` (L108)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/instagram.ts` (L151)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/navigation.ts` (L94, L288)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/block-template.ts` (L58)

### Step 1: 各ファイルを読む

各ファイルを Read ツールで確認し、`findMany` が返す型定義と `findMany` 呼び出し箇所を特定する。

### Step 2: 各 findMany に select を追加

各ファイルの返り値型（`CouponData`, `FaqData`, `IcalTokenData` 等）を確認し、
その型フィールドに対応する `select` を `findMany` に追加する。

**パターン（coupon.ts を例に）:**

1. ファイル内で `CouponData` 型定義を確認
2. `findMany({ where, orderBy, skip, take })` に `select: { ...CouponDataフィールド }` を追加
3. 型が一致することを確認

### Step 3: 型チェック

```bash
bun run type-check
```

Expected: エラーなし

### Step 4: コミット

```bash
git add \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/coupon.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/faq.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/ical-tokens.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/inquiry.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/instagram.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/navigation.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/block-template.ts
git commit -m "perf(db): add explicit select to multiple admin findMany calls"
```

---

## Task 4: media.ts, customer.ts の findMany に select を追加

**Files:**

- `src/app/(admin)/admin/(dashboard)/_shared/actions/media.ts` (L166, L414)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/customer.ts` (L96, L472)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/location.ts` (L105, L195)

### Step 1: 各ファイルを読む

各ファイルを Read ツールで確認し、型定義と `findMany` 呼び出し箇所を特定する。

**注意事項:**

- `media.ts` はメディアファイルのメタデータのみ保持する（バイナリデータはオブジェクトストレージ）
- `customer.ts` の一覧クエリには個人情報フィールド（address, notes 等）が含まれる場合がある
- `location.ts` はロケーション情報

### Step 2: select を追加

Task 2/3 と同じパターンで各 `findMany` に `select` を追加。
各型定義のフィールドをそのまま `select` に列挙する。

### Step 3: 型チェック・コミット

```bash
bun run type-check
git add \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/media.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/customer.ts \
  src/app/'(admin)'/admin/'(dashboard)'/_shared/actions/location.ts
git commit -m "perf(db): add explicit select to media, customer, location findMany"
```

---

## Task 5: terms.ts を分割（756行 → terms/ ディレクトリ）

**Files:**

- Read: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms/queries.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms/mutations.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms/index.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`

### Step 1: terms.ts を読む

全体を Read ツールで確認し、関数を queries（読み取り）と mutations（書き込み）に分類する。

**分類基準:**

- queries: `get*` 系 (`getTermsList`, `getTermsById`, `getTermsAgreements` など)
- mutations: `create*`, `update*`, `delete*`, `publish*`, `archive*` 系

### Step 2: queries.ts を作成

`"use server"` + 必要な import + query 関数のみを `queries.ts` に配置。

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/terms/queries.ts
"use server";

import { prisma } from "@/shared/lib/prisma";
// 必要な import のみ
import { checkReadPermissionFor } from "@/admin/lib/permissions";
// ... 型 import

const checkReadPermission = checkReadPermissionFor("terms");

export async function getTermsList() {
  /* ... */
}
export async function getTermsById() {
  /* ... */
}
// ... query 関数
```

### Step 3: mutations.ts を作成

`"use server"` + 必要な import + mutation 関数のみを `mutations.ts` に配置。

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/terms/mutations.ts
"use server";

import { prisma } from "@/shared/lib/prisma";
import { updateTag } from "next/cache";
// 必要な import のみ
import { withPermission } from "@/admin/lib/server-action-helpers";
// ...

export const createTerms = withPermission(/* ... */);
export const updateTerms = withPermission(/* ... */);
// ... mutation 関数
```

### Step 4: index.ts を作成（barrel）

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/terms/index.ts
// "use server" は不要（queries/mutations が持つ）
export * from "./queries";
export * from "./mutations";
```

### Step 5: 元のファイルを削除し import パスが壊れないか確認

元の `terms.ts` を削除（`git rm`）。

```bash
git rm 'src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts'
```

### Step 6: import パスの確認

他ファイルから `terms.ts` を import している箇所を `Grep` で検索:

```bash
# Grep ツールで検索
pattern: from ['"]\@/admin/actions/terms['"]\|from ['"].*actions/terms['"]
```

import パスが `@/admin/actions/terms` または相対パスの場合は変更不要（barrel が対応）。
直接 `terms/queries` 等にアクセスしている場合は更新。

### Step 7: 型チェック・コミット

```bash
bun run type-check
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/terms/'
git commit -m "refactor(actions): split terms.ts into terms/queries.ts + mutations.ts"
```

---

## Task 6: api-keys.ts を分割（979行 → api-keys/ ディレクトリ）

**Files:**

- Read: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys/queries.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys/mutations.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys/index.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys.ts`

### Step 1: api-keys.ts を読む

全体を Read ツールで確認し、関数を分類する。

**分類基準:**

- queries: `get*` 系 (`getResendSettings`, `getTurnstileSettings`, `getCustomApiKeys` など)
- mutations: `save*`, `update*`, `delete*`, `test*` 系（テスト接続関数は mutations または `connections.ts` を検討）

**注意**: `testResendConnection` 等の接続テスト関数は副作用があるため mutations 側に配置。

### Step 2: queries.ts / mutations.ts / index.ts を作成

Task 5 と同じパターン:

- `queries.ts`: `"use server"` + get 系関数
- `mutations.ts`: `"use server"` + save/test 系関数
- `index.ts`: barrel（`export * from './queries'; export * from './mutations'`）

型ガード関数（`isConnectionStatus`, `isCustomApiKeyStored` 等）は使用する側のファイルに移動するか、
`queries.ts` と `mutations.ts` の両方から参照されるなら共通の `types.ts` または `helpers.ts` に分離。

### Step 3: 元ファイル削除・import 確認・型チェック

```bash
git rm 'src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys.ts'
bun run type-check
```

### Step 4: コミット

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/api-keys/'
git commit -m "refactor(actions): split api-keys.ts into api-keys/queries.ts + mutations.ts"
```

---

## Task 7: post.ts を分割（1052行 → post/ ディレクトリ）

**Files:**

- Read: `src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/queries.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts`
- Create: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/index.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts`

### Step 1: post.ts 全体を読む

全体を確認し関数を分類:

**queries（`post/queries.ts`）:**

- `getPosts` — 一覧取得
- `getPostById` — 詳細取得
- `getPostVersionHistory` — バージョン履歴
- `getPostCategories` — カテゴリ一覧
- `getPostTags` — タグ一覧

**mutations（`post/mutations.ts`）:**

- `createPost` — 新規作成
- `updatePost` — 更新
- `deletePost` — 削除
- `publishPost` — 公開
- `unpublishPost` — 非公開
- `createPostBackup` — バックアップ作成
- `restorePostVersion` — バージョン復元
- `deletePostVersion` — バージョン削除
- `createPostCategory` — カテゴリ作成
- `updatePostCategory` — カテゴリ更新
- `deletePostCategory` — カテゴリ削除
- `createPostTag` — タグ作成
- `updatePostTag` — タグ更新
- `deletePostTag` — タグ削除
- `reorderPostCategories` — カテゴリ並び替え

### Step 2: queries.ts を作成

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/post/queries.ts
"use server";

import { prisma } from "@/shared/lib/prisma";
import { checkReadPermissionFor } from "@/admin/lib/permissions";
import { toPlainArray, toPlainObject } from "@/shared/lib/serialize";
import type { PostWhereInput } from "@/shared/types/prisma";
import { PostStatus } from "@/shared/generated/prisma/enums";
import type {
  PostData,
  PostVersionData,
  PostCategoryData,
  PostTagData,
  GetPostsResult,
  PostFilters,
  PostPagination,
} from "@/admin/lib/validations/post";

const checkReadPermission = checkReadPermissionFor("post");

export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  // ... 元の実装
}

export async function getPostById(id: string): Promise<PostData | null> {
  // ... 元の実装
}

// ... 残りの query 関数
```

### Step 3: mutations.ts を作成

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/post/mutations.ts
"use server";

import { prisma } from "@/shared/lib/prisma";
import { updateTag } from "next/cache";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { createSuccess, createFailure } from "@/admin/types/server-actions";
import { createValidationError } from "@/shared/lib/action-helpers";
import { withPermission } from "@/admin/lib/server-action-helpers";
import { PostStatus } from "@/shared/generated/prisma/enums";
import { purgePostCache } from "@/shared/lib/cloudflare";
import { fireAndForget } from "@/shared/lib/async-utils";
import { ErrorCategory, ErrorSeverity } from "@/shared/lib/errors";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { toPlainObject } from "@/shared/lib/serialize";
import type {
  CreatePostInput,
  UpdatePostInput,
  PostCategoryInput,
  PostTagInput,
} from "@/admin/lib/validations/post";
import {
  createPostSchema,
  updatePostSchema,
  postCategorySchema,
  postTagSchema,
} from "@/admin/lib/validations/post";

export const createPost = withPermission<[CreatePostInput], { id: string }>(
  "post",
  "create",
)(async (user, data) => {
  // ... 元の実装
});

// ... 残りの mutation 関数
```

### Step 4: index.ts を作成

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/actions/post/index.ts
export * from "./queries";
export * from "./mutations";
```

### Step 5: 元ファイル削除・import 確認・型チェック

```bash
git rm 'src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts'
bun run type-check
```

エラーが出た場合は `Grep` で参照元を特定して修正。

### Step 6: テスト実行・コミット

```bash
bun run test
git add 'src/app/(admin)/admin/(dashboard)/_shared/actions/post/'
git commit -m "refactor(actions): split post.ts into post/queries.ts + mutations.ts"
```

---

## Task 8: post getPosts の select 最適化（list クエリで大列除外）

管理画面の投稿一覧では `contentHtml`（大量HTML）と `contentJson`（大量JSON）は不要。
`include` → `select` に変更してこれらを除外する。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post/queries.ts`（Task 7 完了後）
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts`

### Step 1: validations/post.ts に PostListData 型を追加

```typescript
// src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts
// PostData に加えて list 専用型を追加

/**
 * 一覧表示用（contentHtml / contentJson を除外してパフォーマンス改善）
 */
export type PostListData = Omit<PostData, "contentHtml" | "contentJson">;

/**
 * 一覧クエリ結果型を PostListData[] に変更
 */
export type GetPostsResult = {
  posts: PostListData[]; // PostData[] → PostListData[]
  total: number;
  page: number;
  limit: number;
  totalPages: number;
};
```

### Step 2: getPosts の include を select に変更

```typescript
// post/queries.ts の getPosts 内

// Before
prisma.post.findMany({
  where,
  include: {
    category: { select: { id: true, name: true, slug: true } },
    author: { select: { id: true, name: true, email: true } },
    postTags: {
      include: { tag: { select: { id: true, name: true, slug: true } } },
    },
  },
  orderBy: { [sortBy]: sortOrder },
  skip: (page - 1) * limit,
  take: limit,
});

// After: include → select（contentHtml / contentJson を除外）
prisma.post.findMany({
  where,
  select: {
    // スカラーフィールド（contentHtml / contentJson を除外）
    id: true,
    title: true,
    slug: true,
    excerpt: true,
    thumbnailUrl: true,
    ogpImageUrl: true,
    categoryId: true,
    metaDescription: true,
    metaKeywords: true,
    ogpTitle: true,
    ogpDescription: true,
    publishedAt: true,
    status: true,
    viewCount: true,
    createdAt: true,
    updatedAt: true,
    contentWidth: true,
    contentWidthCustom: true,
    // リレーション
    category: { select: { id: true, name: true, slug: true } },
    author: { select: { id: true, name: true, email: true } },
    postTags: {
      include: { tag: { select: { id: true, name: true, slug: true } } },
    },
  },
  orderBy: { [sortBy]: sortOrder },
  skip: (page - 1) * limit,
  take: limit,
});
```

### Step 3: 型チェック

```bash
bun run type-check
```

`PostListData` が使用される箇所で型エラーが出た場合、`contentHtml`/`contentJson` にアクセスしている
コンポーネントを特定し、詳細取得に切り替えるか `getPostById` を使うよう修正。

### Step 4: テスト・コミット

```bash
bun run validate
git add \
  'src/app/(admin)/admin/(dashboard)/_shared/actions/post/queries.ts' \
  'src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts'
git commit -m "perf(db): exclude contentHtml/contentJson from post list query"
```

---

## Task 9: 残りの findMany に select を追加（audit-log, news, dashboard, editor-comment, homepage-settings）

**Files:**

- `src/app/(admin)/admin/(dashboard)/_shared/actions/audit-log.ts` (L167, L252)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts` (L95, L444)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/dashboard.ts` (L196, L227, L273)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts` (L464, L507, L570, L609)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts` (L91, L106)

### Step 1: 各ファイルを読む

各ファイルを Read ツールで確認。news.ts は contentHtml/contentJson 列を持つため注意。

**news.ts の list クエリ（L95）の最適化:**

- `NewsData` 型から `contentHtml`/`contentJson` を除外した `NewsListData` 型を作成
- getPaginatedNews の include → select に変更（post.ts と同パターン）

**audit-log.ts, dashboard.ts, editor-comment.ts, homepage-settings.ts:**

- 各型定義と一致する `select` を追加（大列なし）

### Step 2: select を追加

news.ts については `PostListData` パターンと同様に `NewsListData` 型を作成し、
list クエリで `contentHtml`/`contentJson` を除外。

その他のファイルは型定義に対応する `select` を追加。

### Step 3: 型チェック・コミット

```bash
bun run validate
git add \
  'src/app/(admin)/admin/(dashboard)/_shared/actions/audit-log.ts' \
  'src/app/(admin)/admin/(dashboard)/_shared/actions/news.ts' \
  'src/app/(admin)/admin/(dashboard)/_shared/actions/dashboard.ts' \
  'src/app/(admin)/admin/(dashboard)/_shared/actions/editor-comment.ts' \
  'src/app/(admin)/admin/(dashboard)/_shared/actions/homepage-settings.ts'
git commit -m "perf(db): add explicit select to remaining admin findMany calls"
```

---

## Task 10: 最終検証

### Step 1: 全テスト実行

```bash
bun run test:all
```

Expected: 全テスト PASS

### Step 2: ビルド確認

```bash
bun run validate && bun run build
```

Expected: エラーなし

### Step 3: 完了確認

- [ ] README バージョン更新済み
- [ ] Prisma findMany の select 追加（アクションファイル全体）
- [ ] post.ts → post/ ディレクトリに分割済み
- [ ] api-keys.ts → api-keys/ ディレクトリに分割済み
- [ ] terms.ts → terms/ ディレクトリに分割済み
- [ ] post/news の list クエリで大列（contentHtml/contentJson）除外済み
- [ ] `bun run validate && bun run build` がクリーン

---

## 注意事項

### MINGW64 でのファイル削除

`rm -rf` は deny されているため:

```bash
# NG
rm -rf src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts

# OK: git 追跡ファイルは git rm
git rm 'src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts'
```

### ファイル分割後の import パス

barrel `index.ts` があれば既存の import パスは変更不要。
例: `import { getPosts } from '@/admin/actions/post'` は変更なし。

### PostToolUse フック（Prettier/ESLint）

Edit/Write 後に自動フォーマットが走る。続けて同ファイルを Edit する場合は再 Read が必要。
