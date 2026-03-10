# 投稿カテゴリー・タグUI統一化計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 投稿カテゴリー・タグ管理のUI/UXを他の管理画面と統一し、nuqsを正しく使用する

**Architecture:**

- スペースカテゴリー管理（`space-categories`）のパターンを参考に統一
- Server Component + nuqs Client Componentのハイブリッド構造
- カテゴリーはD&D順序変更を維持しつつ、検索・フィルター機能を追加

**Tech Stack:** Next.js 16 / React 19 / nuqs / @dnd-kit/core / Zod

---

## 現状の問題

| 項目               | カテゴリー      | タグ            | 目標                  |
| ------------------ | --------------- | --------------- | --------------------- |
| nuqs使用           | ❌ なし         | ✅ あり         | ✅ 両方使用           |
| 検索               | ❌ なし         | ✅ あり         | ✅ 両方追加           |
| ソート             | ❌ なし         | ✅ あり         | ✅ 統一               |
| D&D並替            | ✅ あり         | ❌ なし         | ✅ カテゴリーのみ維持 |
| URLリロード復元    | ❌              | ✅              | ✅ 両方対応           |
| コンポーネント分離 | ❌ 単一ファイル | ❌ 単一ファイル | ✅ 分離               |

## 改善方針

1. **共通フィルターhook作成**: `use-taxonomy-filters.ts`
2. **カテゴリー**: 検索追加 + nuqs対応 + D&D維持
3. **タグ**: 既存nuqsを共通hookに統合
4. **コンポーネント分離**: Filters / Table / Dialog を分離

---

## Task 1: 共通フィルターhook作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_hooks/use-taxonomy-filters.ts`
- Delete: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_hooks/use-tag-filters.ts`

**Step 1: 共通hookを作成**

```typescript
// use-taxonomy-filters.ts
"use client";

import { useQueryStates, parseAsString, parseAsBoolean } from "nuqs";
import { useRef, useEffect, useCallback } from "react";

// =============================================================================
// Types
// =============================================================================

export type TaxonomySortField = "name" | "postCount" | "createdAt";
export type SortOrder = "asc" | "desc";

export type TaxonomyFilterParams = {
  search: string;
  sortBy: TaxonomySortField;
  sortOrder: SortOrder;
  unusedOnly: boolean;
};

// =============================================================================
// Debounce Hook
// =============================================================================

function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number,
): (value: string) => void {
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  return useCallback(
    (value: string) => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        callback(value);
      }, delayMs);
    },
    [callback, delayMs],
  );
}

// =============================================================================
// カテゴリーフィルターhook
// =============================================================================

export function useCategoryFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      tab: parseAsString.withDefault("categories"),
    },
    {
      history: "push",
      shallow: false,
    },
  );

  const setSearch = useCallback(
    (value: string) => {
      void setParams({ search: value || null });
    },
    [setParams],
  );

  const setSearchDebounced = useDebouncedCallback(setSearch, 300);

  const reset = useCallback(() => {
    void setParams({ search: null });
  }, [setParams]);

  return {
    params: {
      search: params.search,
    },
    setSearch,
    setSearchDebounced,
    reset,
  };
}

// =============================================================================
// タグフィルターhook
// =============================================================================

export function useTagFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      sortBy: parseAsString.withDefault("name"),
      sortOrder: parseAsString.withDefault("asc"),
      unusedOnly: parseAsBoolean.withDefault(false),
      tab: parseAsString.withDefault("tags"),
    },
    {
      history: "push",
      shallow: false,
    },
  );

  const setSearch = useCallback(
    (value: string) => {
      void setParams({ search: value || null });
    },
    [setParams],
  );

  const setSearchDebounced = useDebouncedCallback(setSearch, 300);

  const toggleSort = useCallback(
    (field: TaxonomySortField) => {
      if (params.sortBy === field) {
        void setParams({
          sortOrder: params.sortOrder === "asc" ? "desc" : "asc",
        });
      } else {
        void setParams({ sortBy: field, sortOrder: "asc" });
      }
    },
    [params.sortBy, params.sortOrder, setParams],
  );

  const setUnusedOnly = useCallback(
    (value: boolean) => {
      void setParams({ unusedOnly: value || null });
    },
    [setParams],
  );

  const reset = useCallback(() => {
    void setParams({
      search: null,
      sortBy: null,
      sortOrder: null,
      unusedOnly: null,
    });
  }, [setParams]);

  return {
    params: {
      search: params.search,
      sortBy: params.sortBy as TaxonomySortField,
      sortOrder: params.sortOrder as SortOrder,
      unusedOnly: params.unusedOnly,
    },
    setSearch,
    setSearchDebounced,
    toggleSort,
    setUnusedOnly,
    reset,
  };
}
```

**Step 2: 検証**

Run: `bun run type-check`
Expected: PASS

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_hooks/
git commit -m "feat(posts): add unified taxonomy filter hooks with nuqs"
```

---

## Task 2: カテゴリーフィルターコンポーネント作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/CategoryFilters.tsx`

**Step 1: フィルターコンポーネント作成**

```typescript
// CategoryFilters.tsx
'use client'

import { Search, X } from 'lucide-react'
import { Button, Input } from '@/admin/components/ui'
import { useCategoryFilters } from '../_hooks/use-taxonomy-filters'

export function CategoryFilters() {
  const { params, setSearchDebounced, reset } = useCategoryFilters()

  const hasFilters = params.search !== ''

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* 検索 */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="カテゴリーを検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
          aria-label="カテゴリーを検索"
        />
      </div>

      {/* リセット */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="mr-1 h-4 w-4" />
          リセット
        </Button>
      )}
    </div>
  )
}
```

**Step 2: 検証**

Run: `bun run type-check`
Expected: PASS

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_components/CategoryFilters.tsx
git commit -m "feat(posts): add CategoryFilters component with nuqs"
```

---

## Task 3: タグフィルターコンポーネント分離

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/TagFilters.tsx`

**Step 1: フィルターコンポーネント作成**

```typescript
// TagFilters.tsx
'use client'

import { Search, X } from 'lucide-react'
import { Button, Input, Checkbox, Label } from '@/admin/components/ui'
import { useTagFilters } from '../_hooks/use-taxonomy-filters'

export function TagFilters() {
  const { params, setSearchDebounced, setUnusedOnly, reset } = useTagFilters()

  const hasFilters =
    params.search !== '' ||
    params.unusedOnly ||
    params.sortBy !== 'name' ||
    params.sortOrder !== 'asc'

  return (
    <div className="flex flex-wrap items-center gap-4">
      {/* 検索 */}
      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          type="search"
          placeholder="タグを検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
          aria-label="タグを検索"
        />
      </div>

      {/* 未使用のみ */}
      <div className="flex items-center gap-2">
        <Checkbox
          id="unused-only"
          checked={params.unusedOnly}
          onCheckedChange={(checked) => setUnusedOnly(checked === true)}
        />
        <Label htmlFor="unused-only" className="text-sm cursor-pointer">
          未使用のみ
        </Label>
      </div>

      {/* リセット */}
      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={reset}>
          <X className="mr-1 h-4 w-4" />
          リセット
        </Button>
      )}
    </div>
  )
}
```

**Step 2: 検証**

Run: `bun run type-check`
Expected: PASS

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_components/TagFilters.tsx
git commit -m "feat(posts): add TagFilters component with nuqs"
```

---

## Task 4: CategoryManagerのリファクタリング

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/CategoryManager.tsx`

**Step 1: 検索機能とnuqs対応を追加**

CategoryManagerを以下のように修正:

1. `useCategoryFilters` hookを使用
2. 検索機能を追加（クライアント側フィルタリング）
3. D&D機能は維持
4. Card構造を維持しつつ、フィルターを上部に配置

主な変更点:

- `useCategoryFilters` hookをインポート・使用
- `filteredCategories` を `useMemo` で計算
- 検索UIを追加（CategoryFiltersコンポーネントをインライン化）
- 結果件数を表示

**Step 2: 検証**

Run: `bun run type-check && bun run lint`
Expected: PASS

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_components/CategoryManager.tsx
git commit -m "feat(posts): add search and nuqs support to CategoryManager"
```

---

## Task 5: TagManagerのリファクタリング

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/TagManager.tsx`

**Step 1: 共通hookに切り替え**

TagManagerを以下のように修正:

1. `use-tag-filters.ts` から `use-taxonomy-filters.ts` に切り替え
2. フィルター部分を `TagFilters` コンポーネントに分離（既にTask 3で作成）
3. SortableTableHeadはそのまま維持

主な変更点:

- import文を `use-taxonomy-filters` に変更
- インラインのフィルターUIを削除（TagFiltersコンポーネントを使用するため、外部から渡すか統合）

**Step 2: 検証**

Run: `bun run type-check && bun run lint`
Expected: PASS

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_components/TagManager.tsx
git commit -m "refactor(posts): use unified taxonomy filters in TagManager"
```

---

## Task 6: 旧hookファイル削除

**Files:**

- Delete: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_hooks/use-tag-filters.ts`

**Step 1: ファイル削除**

```bash
rm src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_hooks/use-tag-filters.ts
```

**Step 2: 検証**

Run: `bun run type-check && bun run lint && bun run build`
Expected: PASS

**Step 3: コミット**

```bash
git add -A
git commit -m "chore(posts): remove deprecated use-tag-filters hook"
```

---

## Task 7: 共通SortableTableHeadコンポーネント抽出

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/SortableTableHead.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/TagManager.tsx`

**Step 1: 共通コンポーネント作成**

```typescript
// SortableTableHead.tsx
'use client'

import type { ReactNode } from 'react'
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { TableHead } from '@/admin/components/ui'

type SortableTableHeadProps<T extends string> = {
  field: T
  currentSortBy: T
  currentSortOrder: 'asc' | 'desc'
  onToggle: (field: T) => void
  children: ReactNode
  className?: string
}

export function SortableTableHead<T extends string>({
  field,
  currentSortBy,
  currentSortOrder,
  onToggle,
  children,
  className,
}: SortableTableHeadProps<T>) {
  const isActive = currentSortBy === field

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => onToggle(field)}
        aria-label={`${children}で並び替え`}
      >
        {children}
        {isActive ? (
          currentSortOrder === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    </TableHead>
  )
}
```

**Step 2: TagManagerで使用**

TagManager内のSortableTableHeadを共通コンポーネントに置き換え

**Step 3: 検証**

Run: `bun run type-check && bun run lint`
Expected: PASS

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/SortableTableHead.tsx
git add src/app/\(admin\)/admin/\(dashboard\)/posts/taxonomy/_components/TagManager.tsx
git commit -m "refactor(admin): extract SortableTableHead as shared component"
```

---

## Task 8: 最終検証とビルド

**Step 1: 全体検証**

Run: `bun run type-check && bun run lint && bun run build`
Expected: PASS

**Step 2: 動作確認項目**

- [ ] `/admin/posts?tab=categories` でカテゴリー一覧表示
- [ ] カテゴリー検索がURLに反映される（`?tab=categories&search=xxx`）
- [ ] ページリロードで検索状態が復元される
- [ ] D&D並べ替えが正常動作
- [ ] `/admin/posts?tab=tags` でタグ一覧表示
- [ ] タグ検索・ソート・未使用フィルターがURLに反映
- [ ] ページリロードでフィルター状態が復元

**Step 3: コミット**

```bash
git add -A
git commit -m "feat(posts): complete taxonomy UI unification with nuqs"
```

---

## 変更後の構造

```
posts/taxonomy/
├── _hooks/
│   └── use-taxonomy-filters.ts  # 統一フィルターhook
├── _components/
│   ├── CategoryManager.tsx      # D&D + 検索対応
│   ├── CategoryFilters.tsx      # 検索UI（オプション）
│   ├── TagManager.tsx           # ソート + フィルター
│   └── TagFilters.tsx           # フィルターUI（オプション）
```

## 期待される改善

| 項目              | Before | After |
| ----------------- | ------ | ----- |
| カテゴリー検索    | ❌     | ✅    |
| カテゴリーURL状態 | ❌     | ✅    |
| タグURL状態       | ✅     | ✅    |
| コード共通化      | ❌     | ✅    |
| 一貫したUX        | ❌     | ✅    |
