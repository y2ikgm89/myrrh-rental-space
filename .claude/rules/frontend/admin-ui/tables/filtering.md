---
description: 管理一覧の複数フィルター共存パターン（BaseFilters + useQueryStates）+ 標準フィルターバー順序
paths:
  - src/app/(admin)/**/*Filters*.tsx
---

# 複数フィルター共存パターン + 標準フィルターバー順序

> `BaseFilters` 内部の `useFilterParams` と親 `useQueryStates(adminXxxSearchParamsParsers, ...)` の共存 + 期間 → 検索 → Select の順序統一。

## 複数フィルター共存パターン（BaseFilters + useQueryStates 直接）

ステータス + search に追加フィルター（種別・タイプ等）を持つ一覧は、`BaseFilters`（内部 `useFilterParams`）と親コンポーネントの `useQueryStates(adminXxxSearchParamsParsers, ...)` を共存させる。両者が同一パーサーマップを参照するため URL 同期は保たれる:

```tsx
"use client";

export function CustomerFilters() {
  const [params, setParams] = useQueryStates(adminCustomerSearchParamsParsers, {
    history: "push",
    shallow: false,
  });
  return (
    <BaseFilters statusOptions={...} searchPlaceholder="...">
      <div className="w-full sm:w-48">
        <Select
          value={params.customerType}
          onValueChange={(v) => void setParams({ customerType: v, page: 1 })}
        >
          <SelectTrigger aria-label="顧客種別"><SelectValue /></SelectTrigger>
          <SelectContent>{/* ... */}</SelectContent>
        </Select>
      </div>
    </BaseFilters>
  );
}
```

### ルール

- 追加フィルターは **`<Select>`（`@/admin/components/ui`）で実装** — ToggleGroup 等の非 Select UI は `BaseFilters` のステータス Select + 既存カテゴリ Select パターンと視覚的一貫性が崩れるため禁止
- パーサーマップは `parseAsStringLiteral([SENTINEL, ...enumValues] as const).withDefault(SENTINEL)` で型安全化（→ `nuqs-patterns.md` §新規 enum フィルター追加時の best practice）
- Sentinel は `"ALL" as const` 等を `_FILTER_ALL` サフィックスで export（例: `CUSTOMER_TYPE_FILTER_ALL`）。空文字 `""` は Radix Select の placeholder 予約なので禁止
- `page.tsx` 側では `parseAsStringLiteral` が validation 責務を持つため `parseXxxFilter` narrowing helper の呼び出しは不要（SSoT 化）

**参照実装**: `PostFilters.tsx`, `InquiryFilters.tsx`, `CustomerFilters.tsx`

## 標準フィルターバー順序

管理一覧ページのフィルターは **期間 | 検索 | Select（ステータス等）** の順に統一する:

- **期間**: 最左、`flex items-center gap-2` でグループ化 + 「期間:」ラベル + 「〜」区切り
- **日付 input**: `w-[160px]` + `aria-label`（`type="date"` は placeholder を無視するため `placeholder` 属性禁止）
- **検索**: `flex-1`（固定幅禁止）
- **Select**: `w-full sm:w-[180px]` で最右
- **wrapper**: `flex flex-col gap-3 sm:flex-row sm:items-center`（`flex-wrap` が必要な場合は `flex flex-wrap items-center gap-3`）

**参照実装**: `ReservationFilters.tsx`, `EventFilters.tsx`, `AuditLogFilters.tsx`
