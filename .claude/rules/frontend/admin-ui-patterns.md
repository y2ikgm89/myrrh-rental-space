---
paths:
  - src/app/(admin)/**
---

# 管理画面 UI パターンルール

> Swiss Industrial Admin テーマ / 一貫性のある管理 UI を実現するためのパターン集

## ページヘッダー標準構造

管理画面の各ページヘッダーは以下の構造を使用する:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">
      ページタイトル
    </h1>
    <p className="text-muted-foreground">説明テキスト</p>
  </div>
  <div className="flex items-center gap-2">{/* アクションボタン */}</div>
</div>
```

**禁止パターン**:

```tsx
// NG: justify-between のみ（モバイル対応なし）
<div className="flex items-center justify-between">

// NG: ハードコードスペーシング
<div className="flex items-center gap-4 justify-between">
```

## セマンティックカラートークン（admin専用）

管理画面でのみ使用できる追加トークン:

| 用途                       | 正しいクラス                 | 禁止クラス                              |
| -------------------------- | ---------------------------- | --------------------------------------- |
| モーダル背景オーバーレイ   | `bg-overlay`                 | `bg-black/60`, `bg-black/50`            |
| サイドバーナビホバー背景   | `hover:bg-sidebar-nav-hover` | `hover:bg-white/5`, `hover:bg-gray-700` |
| サイドバー背景             | `bg-sidebar-bg`              | `bg-gray-900`, `bg-slate-900`           |
| サイドバーボーダー         | `border-sidebar-border`      | `border-gray-700`, `border-slate-700`   |
| サイドバーテキスト         | `text-sidebar-text`          | `text-white`, `text-gray-100`           |
| サイドバーミュートテキスト | `text-sidebar-text-muted`    | `text-gray-400`, `text-slate-400`       |

## ページネーションコンポーネント

ページネーションは必ず `<nav>` 要素にアクセシビリティ属性を付与する:

```tsx
// OK: アクセシブルなページネーション
<nav aria-label="ページネーション" className="flex items-center gap-2">
  <button
    onClick={() => void setPage(page - 1)}  // void で Promise を明示
    disabled={page <= 1}
  >
    前へ
  </button>
</nav>

// NG: bare div + Promise 放置
<div className="flex items-center gap-2">
  <button onClick={() => setPage(page - 1)}>前へ</button>  // setPage は Promise を返す
</div>
```

**`void` キーワードの必要性**:

`nuqs` の `setPage()` / `setParams()` は `Promise<void>` を返す。
`onClick` ハンドラ内で `void` をつけずに呼ぶと `no-floating-promises` lint エラー。

```tsx
// NG: lint エラー（floating promise）
onClick={() => setPage(page + 1)}

// OK
onClick={() => void setPage(page + 1)}
```

## サイドバーモバイルオーバーレイ

サイドバーのモバイルオーバーレイは専用トークンを使用:

```tsx
// OK
<div
  className="fixed inset-0 z-30 bg-overlay lg:hidden"
  onClick={closeSidebar}
/>

// NG: 直接アルファ値を指定
<div className="fixed inset-0 z-30 bg-black/60 lg:hidden" />
```

## Server Actions の型インポート

管理画面内の**全ファイル**（Server Actions・`'use client'` コンポーネント・hooks・型定義ファイルを問わず）は `@/admin/types/server-actions` から import する:

```typescript
// OK: 管理画面専用（Server Actions・'use client' コンポーネント・hooks すべて共通）
import {
  createSuccess,
  createFailure,
  type ActionResult,
} from "@/admin/types/server-actions";

// NG: 共有型を直接 import（管理画面内では禁止）
import { createSuccess, createFailure } from "@/shared/types/server-actions";
```

`@/admin/types/server-actions` は `@/shared/types/server-actions` の re-export に加え、`AuditUser` 型も提供する。

**例外**: `src/app/(admin)/admin/(dashboard)/_shared/types/server-actions.ts` バレルファイル自体（このファイルのみ `@/shared` から import する）。

## ActionResult での withPermission パターン

管理画面の書き込み系 Server Actions は必ず `withPermission` HOF を使用:

```typescript
// OK
export const createItem = withPermission<[ItemInput], { id: string }>(
  "item",
  "create",
)(async (_user, input) => {
  const parsed = schema.safeParse(input);
  if (!parsed.success) return createValidationError(parsed.error);
  // ...
  return createSuccess("作成しました", { id: item.id });
});

// NG: 直接 checkPermission を使う（withPermission が使える場面では禁止）
export async function createItem(input: ItemInput): Promise<ActionResult> {
  const auth = await checkPermission("item", "create");
  if (!auth.success) return auth.error;
  // ...
}
```

## 読み取り系 Actions の権限チェック

- 認証のみ必要（権限ログ不要）: `checkReadPermissionFor()` または `verifyAdminSession()` + プレーン return
- 読み取り + 監査不要: `withPermission(..., { audit: false })`

```typescript
// 単純な読み取り（plain return型）
const checkReadPermission = checkReadPermissionFor("media");

export async function getMediaList(): Promise<MediaData[]> {
  const permError = await checkReadPermission();
  if (permError) return [];
  // ...
}

// ActionResult を返す読み取り（audit: false）
export const getCommentThreads = withPermission<[Query], Thread[]>(
  "post",
  "read",
  { audit: false },
)(async (_user, query) => {
  // ...
  return createSuccess("取得しました", threads);
});
```

## 禁止事項

1. **型 re-export の追加禁止** — 共有型のローカル aliases は不要（`export type Foo = SharedFoo`）
2. **ハードコードカラー禁止** — `bg-black/60` → `bg-overlay`、`hover:bg-white/5` → `hover:bg-sidebar-nav-hover`
3. **bare div ページネーション禁止** — `<nav aria-label="...">` を使用
4. **setPage/setParams の void なし呼び出し禁止** — `void setPage(n)`
5. **`@/shared/types/server-actions` を管理画面で直接使用禁止** — `@/admin/types/server-actions` 経由
