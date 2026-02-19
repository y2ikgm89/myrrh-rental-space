# Admin Code Audit Improvements Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面コードの実装一貫性・公式ベストプラクティス準拠を改善する（3カテゴリ、12ファイル）

**Architecture:** スキャン結果から特定された明確なルール違反を修正する。React 19 / nuqs / Tailwind CSS 4 の各プロジェクトルールに基づく破壊的変更を含む。

**Tech Stack:** Next.js 16, Tailwind CSS 4, nuqs 2.8.8, TypeScript 6.0-beta

---

## 違反カテゴリ

### カテゴリ A: モーダルオーバーレイ背景（tailwind-patterns.md 違反）

`bg-black/50` / `bg-black/80` はモーダル背景に使用禁止。`bg-overlay` を使用する。

**admin.css 定義:** `--color-overlay: oklch(0 0 0 / 0.6)` → `bg-overlay`

| ファイル                                                                | 行  | 現在          | 修正後       |
| ----------------------------------------------------------------------- | --- | ------------- | ------------ |
| `_shared/components/ui/dialog.tsx`                                      | 24  | `bg-black/80` | `bg-overlay` |
| `_shared/components/ui/alert-dialog.tsx`                                | 21  | `bg-black/80` | `bg-overlay` |
| `media/_components/MediaPickerDialog.tsx`                               | 94  | `bg-black/50` | `bg-overlay` |
| `media/_components/MediaDetailDialog.tsx`                               | 125 | `bg-black/50` | `bg-overlay` |
| `media/_components/MediaUploadDialog.tsx`                               | 130 | `bg-black/50` | `bg-overlay` |
| `_shared/components/editor/lexical/plugins/MarkdownExportPlugin.tsx`    | 49  | `bg-black/50` | `bg-overlay` |
| `_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx` | 81  | `bg-black/50` | `bg-overlay` |
| `spaces/[id]/_components/SpaceDetail.tsx`                               | 240 | `bg-black/80` | `bg-overlay` |

**意図的な例外（修正不要）:**

- `SidePanelShell.tsx:23` - `bg-black/20` → ドロワー背景（軽量、意図的）
- `CommentPanel.tsx:262` - `bg-black/20` → ドロワー背景（軽量、意図的）
- `TaxonomyEditor.tsx:422,777` - `hover:bg-black/50` → 画像ホバーオーバーレイ（意図的）
- `MediaGrid.tsx` - 画像ホバーエフェクト（意図的）

### カテゴリ B: nuqs パターン（nuqs-patterns.md 違反）

`customers/page.tsx` と `news/page.tsx` が手動 `await searchParams` + 手動型定義を使用。
他のページ（audit-logs, coupons, media, pages 等）と一貫性がない。

修正: `parsers.ts` にキャッシュローダーを追加し、各ページを移行する。

### カテゴリ C: import パス（admin-ui-patterns.md 違反）

管理画面コードが `@/shared/types/server-actions` を直接使用。`@/admin/types/server-actions` を使用すべき。

| ファイル                                               | 違反                                |
| ------------------------------------------------------ | ----------------------------------- |
| `_shared/lib/action-auth.ts`                           | `createFailure, type ActionFailure` |
| `admin/(auth)/setup/[token]/page.tsx`                  | `isActionFailure`                   |
| `admin/(auth)/setup/[token]/_components/SetupForm.tsx` | `isActionFailure`                   |

---

## Task 1: UI プリミティブのオーバーレイ修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/dialog.tsx:24`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/ui/alert-dialog.tsx:21`

**Step 1: dialog.tsx の bg-black/80 を bg-overlay に変更**

`dialog.tsx:24` の `bg-black/80` を `bg-overlay` に変更:

```tsx
// 変更前
"fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in ...";

// 変更後
"fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in ...";
```

**Step 2: alert-dialog.tsx の bg-black/80 を bg-overlay に変更**

`alert-dialog.tsx:21` の `bg-black/80` を `bg-overlay` に変更:

```tsx
// 変更前
"fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in ...";

// 変更後
"fixed inset-0 z-50 bg-overlay data-[state=open]:animate-in ...";
```

**Step 3: 型チェック**

```bash
bun run type-check
```

期待: エラーなし

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/ui/dialog.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/ui/alert-dialog.tsx
git commit -m "fix(admin/ui): use bg-overlay token in dialog/alert-dialog overlays"
```

---

## Task 2: メディア関連ダイアログのオーバーレイ修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaPickerDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaDetailDialog.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/media/_components/MediaUploadDialog.tsx`

**Step 1: MediaPickerDialog.tsx の修正**

`MediaPickerDialog.tsx:94` の `bg-black/50` を `bg-overlay` に変更。

現在のコード:

```tsx
<div
  className="fixed inset-0 flex items-center justify-center bg-black/50 p-4"
  style={{ zIndex: Z_INDEX.dialog }}
>
```

変更後:

```tsx
<div
  className="fixed inset-0 flex items-center justify-center bg-overlay p-4"
  style={{ zIndex: Z_INDEX.dialog }}
>
```

**Step 2: MediaDetailDialog.tsx の修正**

`MediaDetailDialog.tsx:125` の `bg-black/50` を `bg-overlay` に変更:

```tsx
// 変更前
<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">

// 変更後
<div className="fixed inset-0 bg-overlay z-50 flex items-center justify-center p-4">
```

**Step 3: MediaUploadDialog.tsx の修正**

`MediaUploadDialog.tsx:130` の `bg-black/50` を `bg-overlay` に変更:

```tsx
// 変更前
<div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">

// 変更後
<div className="fixed inset-0 bg-overlay z-50 flex items-center justify-center p-4">
```

**Step 4: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/media/_components/MediaPickerDialog.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/media/_components/MediaDetailDialog.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/media/_components/MediaUploadDialog.tsx
git commit -m "fix(admin/media): use bg-overlay token in media dialog overlays"
```

---

## Task 3: Lexical プラグインとスペース詳細のオーバーレイ修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/MarkdownExportPlugin.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/[id]/_components/SpaceDetail.tsx`

**Step 1: MarkdownExportPlugin.tsx の修正**

`MarkdownExportPlugin.tsx:49` の `bg-black/50` を `bg-overlay` に変更:

```tsx
// 変更前（createPortal内のモーダル）
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  ...
>

// 変更後
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
  ...
>
```

**Step 2: KeyboardShortcutsPlugin.tsx の修正**

`KeyboardShortcutsPlugin.tsx:81` の `bg-black/50` を `bg-overlay` に変更:

```tsx
// 変更前（createPortal内のモーダル）
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
  ...
>

// 変更後
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-overlay"
  ...
>
```

**Step 3: SpaceDetail.tsx の修正**

`SpaceDetail.tsx:240` の `bg-black/80` を `bg-overlay` に変更:

```tsx
// 変更前（画像ライトボックスモーダル）
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4"
  onClick={() => setIsModalOpen(false)}
>

// 変更後
<div
  className="fixed inset-0 z-50 flex items-center justify-center bg-overlay p-4"
  onClick={() => setIsModalOpen(false)}
>
```

**Step 4: 検証**

```bash
bun run validate
```

期待: エラーなし

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/MarkdownExportPlugin.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/components/editor/lexical/plugins/KeyboardShortcutsPlugin.tsx
git add src/app/'(admin)'/admin/'(dashboard)'/spaces/'[id]'/_components/SpaceDetail.tsx
git commit -m "fix(admin/lexical): use bg-overlay token in plugin/space modals"
```

---

## Task 4: nuqs キャッシュローダー追加（parsers.ts）

**Files:**

- Modify: `src/shared/lib/nuqs/parsers.ts`

**Step 1: customers 用キャッシュを追加**

`parsers.ts` の末尾（`loadAdminCalendarSearchParams` の後）に追加:

```typescript
/** 管理画面顧客検索パラメータキャッシュ */
const adminCustomerSearchParamsCache = createSearchParamsCache({
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面顧客検索パラメータローダー */
export async function loadAdminCustomerSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminCustomerSearchParamsCache.parse(searchParams);
  return adminCustomerSearchParamsCache.all();
}
```

**Step 2: news 用キャッシュを追加**

続けて追加:

```typescript
/** 管理画面お知らせ検索パラメータキャッシュ */
const adminNewsSearchParamsCache = createSearchParamsCache({
  tab: parseAsStringLiteral(["posts", "meta"] as const).withDefault("posts"),
  search: parseAsQuery,
  status: parseAsString.withDefault(""),
  page: parseAsPage,
});

/** 管理画面お知らせ検索パラメータローダー */
export async function loadAdminNewsSearchParams(
  searchParams: Promise<SearchParams>,
) {
  await adminNewsSearchParamsCache.parse(searchParams);
  return adminNewsSearchParamsCache.all();
}
```

**注意:** `parseAsStringLiteral` は既存 import に含まれているか確認。含まれていない場合はファイル先頭の import に追加:

```typescript
import {
  createParser,
  createSearchParamsCache,
  parseAsArrayOf,
  parseAsInteger,
  parseAsString,
  parseAsStringLiteral, // ← 既に存在するはず
  type SearchParams,
} from "nuqs/server";
```

**Step 3: 型チェック**

```bash
bun run type-check
```

期待: エラーなし

**Step 4: コミット**

```bash
git add src/shared/lib/nuqs/parsers.ts
git commit -m "feat(nuqs): add admin customer and news search params cache loaders"
```

---

## Task 5: customers/page.tsx の nuqs 移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/customers/page.tsx`

**Step 1: 現状確認**

現在の customers/page.tsx:

```typescript
// ❌ 手動型定義
type SearchParams = Promise<{
  status?: string
  search?: string
  page?: string
}>

// ❌ 手動パース
async function CustomerList({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams
  const status = parseCustomerStatusFilter(params.status)
  const search = params.search
  const page = params.page ? parseInt(params.page, 10) : 1
  ...
}
```

**Step 2: import の更新**

ファイル先頭の import を変更:

```typescript
// 削除: parseCustomerStatusFilter の import（不要になる場合）
// 追加: nuqs の SearchParams 型と loader
import { loadAdminCustomerSearchParams } from "@/shared/lib/nuqs";
import type { SearchParams } from "nuqs/server";
```

**Step 3: 型定義を削除して nuqs の SearchParams を使用**

```typescript
// ❌ 削除
type SearchParams = Promise<{
  status?: string;
  search?: string;
  page?: string;
}>;

// ✅ 追加（PageProps のみ残す）
type PageProps = {
  searchParams: Promise<SearchParams>;
};
```

**Step 4: CustomerList コンポーネントを nuqs パターンに移行**

```typescript
async function CustomerList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { search, status, page } = await loadAdminCustomerSearchParams(searchParams)

  // status は string 型（''=全件）。既存の getCustomers が受け付ける型に変換
  const result = await getCustomers(
    { status: status || undefined, search: search || undefined },
    { page, limit: 10 }
  )

  return (
    <>
      <CustomerTable customers={result.customers} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}
```

**注意:** `getCustomers` の第一引数の型を確認。`status` が `string | undefined` か `CustomerStatus | undefined` かによって、`parseCustomerStatusFilter` が引き続き必要な場合は呼び出しを維持:

```typescript
import { parseCustomerStatusFilter } from "@/shared/lib/validations/enums";

const result = await getCustomers(
  {
    status: parseCustomerStatusFilter(status || undefined),
    search: search || undefined,
  },
  { page, limit: 10 },
);
```

**Step 5: PageProps を更新**

```typescript
type PageProps = {
  searchParams: Promise<SearchParams>;
};
```

**Step 6: 型チェック**

```bash
bun run type-check
```

期待: エラーなし。型エラーがあれば getCustomers の引数型に合わせて調整。

**Step 7: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/customers/page.tsx
git commit -m "feat(admin/customers): migrate searchParams to nuqs createSearchParamsCache pattern"
```

---

## Task 6: news/page.tsx の nuqs 移行

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/news/page.tsx`

**Step 1: 現状確認**

現在の news/page.tsx:

```typescript
// ❌ 手動型定義
type SearchParams = Promise<{
  tab?: string;
  status?: string;
  search?: string;
  page?: string;
}>;

// ❌ Set-based タブガード（nuqs で不要になる）
const NEWS_TABS = ["posts", "meta"] as const;
type NewsTab = (typeof NEWS_TABS)[number];
const NEWS_TABS_SET = new Set<string>(NEWS_TABS);
function isValidTab(tab: string | undefined): tab is NewsTab {
  return typeof tab === "string" && NEWS_TABS_SET.has(tab);
}

// ❌ 手動パース
const params = await searchParams;
const currentTab = isValidTab(params.tab) ? params.tab : "posts";
```

**Step 2: import の更新**

```typescript
import { loadAdminNewsSearchParams } from "@/shared/lib/nuqs";
import type { SearchParams } from "nuqs/server";
```

**Step 3: 手動型定義・型ガードを削除**

以下を削除:

- `const NEWS_TABS = [...]` 定数（タブリテラルは parsers.ts に移動済み）
- `type NewsTab` 型定義
- `const NEWS_TABS_SET` Set 定義
- `function isValidTab` 型ガード関数
- ローカルの `type SearchParams = Promise<{...}>` 型定義

**Step 4: ページコンポーネントを nuqs パターンに移行**

```typescript
type PageProps = {
  searchParams: Promise<SearchParams>
}

export default async function NewsPage({ searchParams }: PageProps) {
  const { tab: currentTab } = await loadAdminNewsSearchParams(searchParams)
  // currentTab は 'posts' | 'meta' 型（型ガード不要）

  return (
    <div className="space-y-6">
      {/* ...ヘッダー... */}
      <Tabs defaultValue={currentTab} className="space-y-6">
        {/* ...タブコンテンツ... */}
      </Tabs>
    </div>
  )
}
```

**Step 5: NewsList コンポーネントを nuqs パターンに移行**

```typescript
async function NewsList({ searchParams }: { searchParams: Promise<SearchParams> }) {
  const { search, status, page } = await loadAdminNewsSearchParams(searchParams)

  const result = await getNewsList(
    { status: parseNewsStatusFilter(status || undefined), search: search || undefined },
    { page, limit: 10 }
  )

  return (
    <>
      <NewsTable news={result.news} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  )
}
```

**Step 6: 型チェック**

```bash
bun run type-check
```

期待: エラーなし

**Step 7: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/news/page.tsx
git commit -m "feat(admin/news): migrate searchParams to nuqs createSearchParamsCache pattern"
```

---

## Task 7: @/shared → @/admin import パス修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/action-auth.ts`
- Modify: `src/app/(admin)/admin/(auth)/setup/[token]/page.tsx`
- Modify: `src/app/(admin)/admin/(auth)/setup/[token]/_components/SetupForm.tsx`

**背景:**

`@/admin/types/server-actions` は `@/shared/types/server-actions` を re-export するラッパー（+ `AuditUser` 型追加）。
admin-ui-patterns.md の「管理画面では `@/admin/types/server-actions` を使用」ルールに従い、直接 shared を参照しているファイルを修正。

**Step 1: action-auth.ts の修正**

`action-auth.ts:23` の import を変更:

```typescript
// 変更前
import {
  createFailure,
  type ActionFailure,
} from "@/shared/types/server-actions";

// 変更後
import {
  createFailure,
  type ActionFailure,
} from "@/admin/types/server-actions";
```

**Step 2: setup/[token]/page.tsx の修正**

`page.tsx:10` の import を変更:

```typescript
// 変更前
import { isActionFailure } from "@/shared/types/server-actions";

// 変更後
import { isActionFailure } from "@/admin/types/server-actions";
```

**Step 3: SetupForm.tsx の修正**

`SetupForm.tsx:13` の import を変更:

```typescript
// 変更前
import { isActionFailure } from "@/shared/types/server-actions";

// 変更後
import { isActionFailure } from "@/admin/types/server-actions";
```

**Step 4: 検証**

```bash
bun run validate
```

期待: type-check と lint ともにエラーなし

**Step 5: コミット**

```bash
git add src/app/'(admin)'/admin/'(dashboard)'/_shared/lib/action-auth.ts
git add src/app/'(admin)'/admin/'(auth)'/setup/'[token]'/page.tsx
git add src/app/'(admin)'/admin/'(auth)'/setup/'[token]'/_components/SetupForm.tsx
git commit -m "fix(admin): use @/admin/types/server-actions instead of @/shared directly"
```

---

## Task 8: 最終検証

**Step 1: 完全検証**

```bash
bun run validate && bun run build
```

期待: type-check、lint、build ともにエラーなし

**Step 2: 変更サマリー確認**

```bash
git log --oneline -7
```

期待: 7コミットが表示される（Task 1〜7 のコミット）

---

## 修正対象外（意図的な例外）

以下は問題ではない（変更不要）:

| ファイル                                     | 理由                                                     |
| -------------------------------------------- | -------------------------------------------------------- |
| `SidePanelShell.tsx`                         | `bg-black/20` はドロワー背景（軽量オーバーレイ、意図的） |
| `CommentPanel.tsx`                           | `bg-black/20` はドロワー背景（軽量オーバーレイ、意図的） |
| `TaxonomyEditor.tsx`                         | `hover:bg-black/50` は画像ホバーオーバーレイ（意図的）   |
| `MediaGrid.tsx`                              | 画像ホバーエフェクト（意図的）                           |
| `DesignPreview.tsx`                          | デザインプレビュー文脈（意図的）                         |
| `HighlightPlugin.tsx`, `TextColorPlugin.tsx` | エディタ色スウォッチ（実際の色表示用途）                 |
| `calendar-domain.ts`                         | カレンダーイベント色分け（視覚的区別が目的）             |
| `message:` プロパティ                        | API接続テスト結果オブジェクト（Zodエラーではない）       |
