---
paths:
  - src/app/**
---

# nuqs パターンルール

> nuqs 2.8.9 / Next.js 16.2 対応

> 詳細サブルール（path-scoped auto-load）:
>
> - **5 基本パターン (useQueryState / useQueryStates / Server Component cache / ネスト SC / 共有 parsers)** — `nuqs-patterns/usage-patterns.md`
> - **組み込み / カスタム parser + enum フィルター best practice + プロジェクト標準パーサー集約** — `nuqs-patterns/parsers.md`

## 概要

nuqs は URL 状態管理ライブラリ。クエリパラメータを型安全に管理。

## NuqsAdapter（`useQueryState(s)` を使う subtree の親）

公開ページ（`src/app/(public)/layout.tsx` の `FilterBar` 等）と管理ダッシュボード（`src/app/(admin)/admin/(dashboard)/layout.tsx`）でそれぞれラップする。Multiple Root Layouts のため二重ラップにはならない。実装は各レイアウトの `html` / `body` 構造に合わせる（公開側で `Suspense` が必要なら公式・既存レイアウトに従う）。

```typescript
// 例: 管理ダッシュボード
// src/app/(admin)/admin/(dashboard)/layout.tsx
import { NuqsAdapter } from 'nuqs/adapters/next/app'

export default function DashboardLayout({ children }) {
  return (
    <NuqsAdapter>
      {children}
    </NuqsAdapter>
  )
}
```

## 型推論

```typescript
import type { inferParserType } from "nuqs";

// パーサーから型を推論
type PageNumber = inferParserType<typeof parseAsPage>; // number
type SortOrderType = inferParserType<typeof parseAsSortOrder>; // 'asc' | 'desc'
```

## useFilterParams フック（管理画面共通）

管理画面のフィルター機能は共通フックを使用:

```typescript
"use client";

import {
  useFilterParams,
  useFilterParamsWithCategory,
} from "@/admin/hooks/use-filter-params";

// 基本フィルター（カテゴリなし）
const { params, setSearch, setSearchDebounced, setStatus, setPage, reset } =
  useFilterParams({ debounceMs: 300, defaultPerPage: 10 });

// カテゴリ付きフィルター
const { params, setCategory } = useFilterParamsWithCategory({
  defaultStatus: "",
});
```

フックは `adminCustomerSearchParamsParsers` を spread しつつ `perPage` / `categoryId` 等を合成した `useQueryStates` + `{ history: 'push', shallow: false }` で実装されており、`null` セット（URL パラメータ削除）と `page: 1` リセットを自動処理する。

## 禁止事項

1. **マジックストリング禁止**

   ```typescript
   // NG: パーサーなしの useQueryState
   useQueryState("sort");

   // OK: パーサーを必ず渡す
   useQueryState("sort", parseAsSortOrder);
   ```

2. **型アサーション禁止**

   ```typescript
   // NG: 型アサーション
   params.sort as "asc" | "desc";

   // OK: parseAsSortOrder が型を保証
   const [sort] = useQueryState("sort", parseAsSortOrder); // 'asc' | 'desc'
   ```

3. **直接的な URL 操作は原則禁止（意図的例外あり）**

   ```typescript
   // NG: 手動でクエリだけ書き換え（フィルタ・ページネーション）
   const sp = new URLSearchParams(window.location.search);
   sp.set("page", "2");

   // OK: nuqs の setParams を使用
   void setParams({ page: 2 });
   ```

   **例外**: ハブのタブ切替で RSC をフルナビさせる `Link` の `href` 組み立て（例: `SpaceManagementTabs`）は `URLSearchParams` 可。

4. **パーサーの重複定義禁止**
   - `@/shared/lib/nuqs/parsers.ts` に集約。各ドメインファイルにはパーサーを定義しない（→ `nuqs-patterns/parsers.md`）

5. **パーサーマップは `export` 必須**
   - Client Component（`useQueryStates`）と Server（`createSearchParamsCache`）で同一パーサーマップを共有するため、全パーサーマップを `export const` で定義する。`const` のまま非 export にしない

6. **Promise 未処理の放置禁止**

   ```typescript
   // NG: 未処理の Promise（lint エラー）
   setParams({ page: 2 });

   // OK: void で明示
   void setParams({ page: 2 });
   ```

7. **shallow: true での Server Component 更新禁止**

   ```typescript
   // NG: shallow: true だと Server Component が再レンダリングされない
   useQueryStates(parsers, { history: "push", shallow: true });

   // OK: Server Component と連携する場合は shallow: false
   useQueryStates(parsers, { history: "push", shallow: false });
   ```

   **例外**:
   - **RSC 一覧タブ**で URL の `searchParams` を正にしたい場合は、`Link` でクエリを更新するか `shallow: false` を使う
   - **同一ページ内のクライアント専用タブ**（例: 編集フォームの「基本 / 料金」切替で RSC を再取得しない）は `shallow: true` や `useQueryState` のみでもよい

8. **`shallow: true` で useQueryStates する Client Component に SC から initial props を渡さない**

   `shallow: true` は RSC を再レンダーしないため、SC で parse した初期値を props で渡すと最初の URL 変更後に stale 化する。useQueryStates は SSR でも URL から値を読むため、Client で直接読み、fallback は「today」等の非 SC 値にする。`shallow: false` の場合は SC が都度 parse するので initial props OK（`events-view-switcher.tsx` の `activeView` prop パターン）。

   ```typescript
   // NG: shallow: true + initial props（URL clean 後に stale）
   <EventCalendarView initialYear={parsedY} initialMonth={parsedM} />
   // Client 側: const y = urlY ?? initialYear ?? today.year  ← initialYear が SSR 時点で固着

   // OK: Client で useQueryStates のみ + today fallback
   const [{ y: urlY, m: urlM }] = useQueryStates(parsers, { shallow: true })
   const year = urlY ?? today.year
   ```

   参照実装: `src/app/(public)/events/_components/use-calendar-month.ts`

## ファイル配置

| パス                                 | 内容                                                       |
| ------------------------------------ | ---------------------------------------------------------- |
| `@/shared/lib/nuqs/parsers.ts`       | 共有パーサー定義・キャッシュ・ローダー関数・パーサーマップ |
| `@/shared/lib/nuqs/index.ts`         | barrel（`parsers.ts` を re-export）                        |
| `@/public/lib/search-params.ts`      | 公開ページ専用のシンプルなキャッシュ定義                   |
| `@/admin/hooks/use-filter-params.ts` | 管理画面フィルター共通フック                               |

## 参考

- [nuqs 公式ドキュメント](https://nuqs.dev)
- [nuqs Server Side](https://nuqs.dev/docs/server-side)
- [nuqs Parsers](https://nuqs.dev/docs/parsers)
