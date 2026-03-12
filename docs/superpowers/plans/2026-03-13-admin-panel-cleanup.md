# Admin Panel Full Cleanup Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 管理画面を Next.js 16 公式ベストプラクティスに準拠した統一構造にフルクリーンアップする。

**Architecture:** ハイブリッドアプローチ — 共通基盤を先に構築し、テンプレートリソース（customers）で検証後、全リソースに並列展開する。各タスクは独立してコミット可能な単位。

**Tech Stack:** Next.js 16, React 19, TypeScript 6.0, React Hook Form 8, Zod 4, Tailwind CSS 4, Radix UI

**Spec:** `docs/superpowers/specs/2026-03-13-admin-panel-cleanup-design.md`

**Base path:** `src/app/(admin)/admin/(dashboard)/`（以下 `BASE` と略記）

---

## Chunk 1: 共通基盤の構築

### Task 1: ResourceLoading 共通コンポーネント作成

**Files:**

- Create: `BASE/_shared/components/ResourceLoading.tsx`

- [ ] **Step 1: ResourceLoading.tsx を作成**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/ResourceLoading.tsx
export default function ResourceLoading() {
  return (
    <div className="space-y-6 animate-pulse">
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <div className="h-8 w-48 rounded bg-muted" />
          <div className="h-4 w-64 rounded bg-muted" />
        </div>
        <div className="h-10 w-28 rounded bg-muted" />
      </div>
      <div className="h-10 w-full max-w-sm rounded bg-muted" />
      <div className="rounded-lg border bg-card">
        <div className="space-y-3 p-4">
          {Array.from({ length: 5 }, (_, i) => (
            <div key={i} className="h-12 w-full rounded bg-muted" />
          ))}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/ResourceLoading.tsx'
git commit -m "feat(admin): add ResourceLoading shared component"
```

---

### Task 2: ResourceError 共通コンポーネント作成

**Files:**

- Create: `BASE/_shared/components/ResourceError.tsx`

- [ ] **Step 1: ResourceError.tsx を作成**

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/ResourceError.tsx
"use client";

import { useEffect } from "react";
import { AlertTriangle } from "lucide-react";
import { Button } from "@/admin/components/ui/button";
import { logger } from "@/shared/lib/logger";

export default function ResourceError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    logger.error("Admin error boundary triggered", {
      error: error.message,
      digest: error.digest,
    });
  }, [error]);

  return (
    <div className="flex flex-col items-center justify-center min-h-[400px] p-8">
      <AlertTriangle className="h-12 w-12 text-destructive mb-4" />
      <h2 className="text-xl font-semibold mb-2">エラーが発生しました</h2>
      <p className="text-muted-foreground mb-4 text-center max-w-md">
        データの読み込みに失敗しました。
      </p>
      <Button onClick={reset} variant="outline">
        再試行
      </Button>
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/ResourceError.tsx'
git commit -m "feat(admin): add ResourceError shared component"
```

---

### Task 3: ListPageHeader 共通コンポーネント作成

**Files:**

- Create: `BASE/_shared/components/ListPageHeader.tsx`

- [ ] **Step 1: ListPageHeader.tsx を作成**

Spec Section 2.1 のコードをそのまま使用する。Server Component（`"use client"` なし）。

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/ListPageHeader.tsx
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/admin/components/ui/button";

type ListPageHeaderProps = {
  title: string;
  description: string;
  createHref?: string;
  createLabel?: string;
  actions?: React.ReactNode;
};

export function ListPageHeader({
  title,
  description,
  createHref,
  createLabel = "新規作成",
  actions,
}: ListPageHeaderProps) {
  return (
    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-foreground">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground sm:text-base">
          {description}
        </p>
      </div>
      {actions ??
        (createHref && (
          <Button asChild className="min-h-10 sm:min-h-9">
            <Link href={createHref}>
              <Plus className="mr-2 h-4 w-4" />
              {createLabel}
            </Link>
          </Button>
        ))}
    </div>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/ListPageHeader.tsx'
git commit -m "feat(admin): add ListPageHeader shared component"
```

---

### Task 4: ResourceActionCell 共通コンポーネント作成

**Files:**

- Create: `BASE/_shared/components/ResourceActionCell.tsx`

- [ ] **Step 1: ResourceActionCell.tsx を作成**

Spec Section 2.2 のコードをそのまま使用する。

```tsx
// src/app/(admin)/admin/(dashboard)/_shared/components/ResourceActionCell.tsx
"use client";

import { Fragment } from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "./ActionDropdown";

type ResourceAction = {
  label: string;
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
};

type ResourceActionCellProps = {
  actions: ResourceAction[];
};

export function ResourceActionCell({ actions }: ResourceActionCellProps) {
  return (
    <ActionDropdown>
      {actions.map((action, i) => (
        <Fragment key={action.label}>
          {action.destructive && i > 0 && <ActionDropdownSeparator />}
          <ActionDropdownItem
            href={action.href}
            onClick={action.onClick}
            destructive={action.destructive}
            disabled={action.disabled}
          >
            {action.label}
          </ActionDropdownItem>
        </Fragment>
      ))}
    </ActionDropdown>
  );
}
```

- [ ] **Step 2: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 3: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/_shared/components/ResourceActionCell.tsx'
git commit -m "feat(admin): add ResourceActionCell shared component"
```

---

## Chunk 2: テンプレートリソース（customers）の完全移行

### Task 5: customers — loading.tsx + error.tsx 追加

**Files:**

- Create: `BASE/customers/loading.tsx`
- Modify: `BASE/customers/error.tsx` → re-export に置換

- [ ] **Step 1: loading.tsx を作成**

```tsx
// src/app/(admin)/admin/(dashboard)/customers/loading.tsx
export { default } from "../_shared/components/ResourceLoading";
```

- [ ] **Step 2: error.tsx を re-export に置換**

既存の `customers/error.tsx` の内容を読み、ResourceError と同一であることを確認後、re-export に置換する。

```tsx
// src/app/(admin)/admin/(dashboard)/customers/error.tsx
export { default } from "../_shared/components/ResourceError";
```

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/customers/loading.tsx' 'src/app/(admin)/admin/(dashboard)/customers/error.tsx'
git commit -m "feat(admin): add loading.tsx and standardize error.tsx for customers"
```

---

### Task 6: customers — ListPageHeader 適用

**Files:**

- Modify: `BASE/customers/page.tsx`

- [ ] **Step 1: page.tsx を読んで手動ヘッダー部分を特定**

現状のヘッダー部分:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold tracking-tight text-foreground">
      顧客管理
    </h1>
    <p className="text-sm text-muted-foreground sm:text-base">
      顧客情報の確認・ステータス管理を行います
    </p>
  </div>
  <Button asChild className="min-h-10 sm:min-h-9">
    <Link href="/admin/customers/new">
      <Plus className="mr-2 h-4 w-4" />
      新規顧客
    </Link>
  </Button>
</div>
```

- [ ] **Step 2: ListPageHeader に置換**

ヘッダー部分を以下に置換:

```tsx
<ListPageHeader
  title="顧客管理"
  description="顧客情報の確認・ステータス管理を行います"
  createHref="/admin/customers/new"
  createLabel="新規顧客"
/>
```

`import { ListPageHeader } from "@/admin/components/ListPageHeader";` を追加し、不要になった `Link`, `Plus`, `Button` の import を削除する。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add 'src/app/(admin)/admin/(dashboard)/customers/page.tsx'
git commit -m "refactor(admin): use ListPageHeader in customers page"
```

---

### Task 7: customers — Form 統一（CustomerEditForm 削除）

**Files:**

- Modify: `BASE/customers/_components/CustomerForm.tsx` — `customer?` prop 追加
- Modify: `BASE/customers/new/page.tsx` — CustomerForm を prop なしで呼び出し
- Modify: `BASE/customers/[id]/edit/page.tsx` — CustomerForm を prop ありで呼び出し
- Delete: `BASE/customers/_components/CustomerEditForm.tsx`

- [ ] **Step 1: CustomerForm.tsx と CustomerEditForm.tsx を両方読んで差分を特定**

両ファイルを Read して差分を確認する。主な違い:

- `defaultValues` のソース（空 vs `customer` prop）
- `submitFn`（`createCustomer` vs `updateCustomer`）
- `redirectTo` / `successMessage`
- SubmitButton の label

- [ ] **Step 2: CustomerForm.tsx に `customer?` prop を追加**

```tsx
type CustomerFormProps = {
  customer?: CustomerData; // undefined = 新規, defined = 編集
};

export function CustomerForm({ customer }: CustomerFormProps) {
  const isEdit = !!customer;

  const { form, isPending, onSubmit } = useFormAction({
    schema: customerFormSchema,
    submitFn: async (data) =>
      isEdit ? updateCustomer(customer.id, data) : createCustomer(data),
    options: {
      defaultValues: customer ? toFormValues(customer) : defaultValues,
      redirectTo: isEdit
        ? `/admin/customers/${customer.id}`
        : "/admin/customers",
      successMessage: isEdit ? "更新しました" : "作成しました",
    },
  });
  // ... フォーム UI（変更なし）
  // SubmitButton の label を isEdit で分岐
}
```

`toFormValues` ヘルパーが必要な場合は同ファイル内に追加する（CustomerEditForm から移植）。

- [ ] **Step 3: new/page.tsx を更新**

既に CustomerForm を prop なしで呼んでいるはず。import パスに変更がないことを確認。

- [ ] **Step 4: [id]/edit/page.tsx を更新**

`CustomerEditForm` の import を `CustomerForm` に変更し、`customer` prop を渡す:

```tsx
import { CustomerForm } from "../../_components/CustomerForm";
// ...
<CustomerForm customer={customer} />;
```

- [ ] **Step 5: CustomerEditForm.tsx を削除**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/customers/_components/CustomerEditForm.tsx'
```

- [ ] **Step 6: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS（import パスが変わるテストがあれば修正）

- [ ] **Step 7: コミット**

```bash
git add -A
git commit -m "refactor(admin): unify CustomerForm for create/edit"
```

---

### Task 8: customers — ActionCell を ResourceActionCell に置換

**Files:**

- Modify: `BASE/customers/_components/CustomerTable.tsx` — ResourceActionCell をインライン使用
- Delete: `BASE/customers/_components/CustomerActionCell.tsx`

- [ ] **Step 1: CustomerTable.tsx を読む**

CustomerActionCell の使用箇所を確認。

- [ ] **Step 2: CustomerTable.tsx で ResourceActionCell に置換**

import を変更:

```tsx
import { ResourceActionCell } from "@/admin/components/ResourceActionCell";
```

テーブル行内の `<CustomerActionCell customerId={customer.id} />` を以下に置換:

```tsx
<ResourceActionCell
  actions={[
    { label: "編集", href: `/admin/customers/${customer.id}/edit` },
    { label: "詳細", href: `/admin/customers/${customer.id}` },
  ]}
/>
```

- [ ] **Step 3: CustomerActionCell.tsx を削除**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/customers/_components/CustomerActionCell.tsx'
```

- [ ] **Step 4: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "refactor(admin): replace CustomerActionCell with ResourceActionCell"
```

---

### Task 9: テンプレート検証 — validate + build

- [ ] **Step 1: フル検証**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: テスト**

Run: `bun run test`
Expected: 全 PASS

---

## Chunk 3: loading.tsx + error.tsx 全リソース展開

### Task 10: 全リソースに loading.tsx + error.tsx を配置

**Files:**

- Create: 14 x `loading.tsx`（customers は Task 5 で完了済み、space-categories は page.tsx なしで除外）
- Create/Modify: 14 x `error.tsx`（既存は re-export に置換、未作成は新規作成）

対象リソース一覧:

1. `audit-logs`
2. `coupons`
3. `faq`
4. `inquiries`
5. `locations`
6. `media`
7. `news`
8. `pages`
9. `posts`
10. `reservations`
11. `settings`
12. `spaces`
13. `staff`
14. `terms`

（customers は Task 5 で完了済み）

- [ ] **Step 1: 全リソースに loading.tsx を作成**

各リソースディレクトリに以下の内容で `loading.tsx` を作成:

```tsx
export { default } from "../_shared/components/ResourceLoading";
```

**注意**: `locations` は `page.tsx` がないが、`[id]/page.tsx` 等のサブルートがあるため `loading.tsx` は有効。

- [ ] **Step 2: 全リソースの error.tsx を re-export に置換**

各リソースの既存 `error.tsx` を以下に置換:

```tsx
export { default } from "../_shared/components/ResourceError";
```

`locations` は `error.tsx` が存在しないため新規作成する（サブルートのエラーをキャッチするため必要）。`space-categories` は `page.tsx` がなく対象外。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "feat(admin): add loading.tsx and standardize error.tsx for all resources"
```

---

## Chunk 4: ListPageHeader 全リソース展開

### Task 11: 全一覧ページに ListPageHeader 適用

**Files:**

- Modify: 13 x `page.tsx`（customers は Task 6 で完了済み）

対象ページと置換パラメータ:

| ページ         | title        | description                        | createHref                          | createLabel  |
| -------------- | ------------ | ---------------------------------- | ----------------------------------- | ------------ |
| `audit-logs`   | 操作ログ     | 管理者の操作履歴を確認します       | なし                                | なし         |
| `coupons`      | クーポン管理 | クーポンの作成・管理を行います     | /admin/coupons/new                  | 新規クーポン |
| `faq`          | FAQ管理      | よくある質問の管理を行います       | （`actions` prop 使用の可能性あり） | —            |
| `inquiries`    | お問い合わせ | お問い合わせの確認・対応を行います | なし                                | なし         |
| `media`        | メディア     | 画像・ファイルの管理を行います     | （`actions` prop 使用の可能性あり） | —            |
| `news`         | お知らせ管理 | お知らせの作成・管理を行います     | /admin/news/new                     | 新規お知らせ |
| `pages`        | ページ管理   | カスタムページの管理を行います     | （`actions` prop 使用の可能性あり） | —            |
| `posts`        | ブログ管理   | ブログ記事の作成・管理を行います   | /admin/posts/new                    | 新規記事     |
| `reservations` | 予約管理     | 予約の確認・管理を行います         | /admin/reservations/new             | 新規予約     |
| `settings`     | 設定         | サイト設定の管理を行います         | なし（`actions` prop）              | —            |
| `spaces`       | スペース管理 | スペースの作成・管理を行います     | /admin/spaces/new                   | 新規スペース |
| `staff`        | スタッフ管理 | スタッフの招待・管理を行います     | /admin/staff/new                    | スタッフ招待 |
| `terms`        | 利用規約管理 | 利用規約の作成・管理を行います     | /admin/terms/new                    | 新規規約     |

- [ ] **Step 1: 各ページの page.tsx を読み、手動ヘッダーを ListPageHeader に置換**

各ファイルを Read → ヘッダー部分を特定 → ListPageHeader に置換。
title/description/createHref/createLabel は現状のヘッダーから読み取る（上の表は目安）。
カスタムアクション（例: spaces のタブ切替ボタン等）がある場合は `actions` prop を使用。

- [ ] **Step 2: 不要になった import を削除**

各ページで `Plus`, `Link`, `Button` が ListPageHeader 内に移動したことにより不要になる import を削除。
ただし他の箇所で使用している場合は維持。

- [ ] **Step 3: 型チェック**

Run: `bun run type-check`
Expected: PASS

- [ ] **Step 4: コミット**

```bash
git add -A
git commit -m "refactor(admin): use ListPageHeader across all list pages"
```

---

## Chunk 5: ActionCell 共通化（残り 5 リソース）

### Task 12: Simple ActionCell を ResourceActionCell に置換

**Files:**

- Modify: 5 x `*Table.tsx`
- Delete: 5 x `*ActionCell.tsx`

対象:

| テーブル               | 旧 ActionCell           | アクション |
| ---------------------- | ----------------------- | ---------- |
| `CouponTable.tsx`      | `CouponActionCell`      | 編集       |
| `LocationTable.tsx`    | `LocationActionCell`    | 編集, 詳細 |
| `SpaceTable.tsx`       | `SpaceActionCell`       | 編集, 詳細 |
| `InquiryTable.tsx`     | `InquiryActionCell`     | 詳細       |
| `ReservationTable.tsx` | `ReservationActionCell` | 編集, 詳細 |

- [ ] **Step 1: 各 Table.tsx を読み、ActionCell の使用箇所を特定**

- [ ] **Step 2: ResourceActionCell に置換**

各テーブルで:

1. `import { ResourceActionCell } from "@/admin/components/ResourceActionCell";` を追加
2. 旧 ActionCell の import を削除
3. `<XxxActionCell xxxId={id} />` を `<ResourceActionCell actions={[...]} />` に置換

各リソースの actions 配列:

- **coupons**: `[{ label: "編集", href: \`/admin/coupons/${id}\` }]`
- **locations**: `[{ label: "編集", href: \`/admin/locations/${id}/edit\` }, { label: "詳細", href: \`/admin/locations/${id}\` }]`
- **spaces**: `[{ label: "編集", href: \`/admin/spaces/${id}/edit\` }, { label: "詳細", href: \`/admin/spaces/${id}\` }]`
- **inquiries**: `[{ label: "詳細", href: \`/admin/inquiries/${id}\` }]`
- **reservations**: `[{ label: "編集", href: \`/admin/reservations/${id}/edit\` }, { label: "詳細", href: \`/admin/reservations/${id}\` }]`

- [ ] **Step 3: 旧 ActionCell ファイルを削除**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/coupons/_components/CouponActionCell.tsx'
git rm 'src/app/(admin)/admin/(dashboard)/locations/_components/LocationActionCell.tsx'
git rm 'src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceActionCell.tsx'
git rm 'src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryActionCell.tsx'
git rm 'src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationActionCell.tsx'
```

- [ ] **Step 4: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "refactor(admin): replace Simple ActionCells with ResourceActionCell"
```

---

## Chunk 6: フォーム統一（reservations）

### Task 13: reservations — Form 統一

**Files:**

- Modify: `BASE/reservations/_components/ReservationForm.tsx`
- Modify: `BASE/reservations/new/page.tsx`
- Modify: `BASE/reservations/[id]/edit/page.tsx`
- Delete: `BASE/reservations/_components/ReservationEditForm.tsx`

- [ ] **Step 1: ReservationForm.tsx と ReservationEditForm.tsx を読んで差分を特定**

- [ ] **Step 2: ReservationForm に `reservation?` prop を追加**

CustomerForm（Task 7）と同じパターンで:

- `reservation?: ReservationData` prop
- `isEdit = !!reservation`
- `submitFn` を `isEdit` で分岐
- `defaultValues` を `reservation` から生成 or デフォルト値
- `SubmitButton` の label を分岐

- [ ] **Step 3: new/page.tsx と [id]/edit/page.tsx を更新**

- `new/page.tsx`: prop なしで `<ReservationForm />`
- `[id]/edit/page.tsx`: `import { ReservationForm }` に変更、`reservation` prop を渡す

- [ ] **Step 4: ReservationEditForm.tsx を削除**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationEditForm.tsx'
```

- [ ] **Step 5: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "refactor(admin): unify ReservationForm for create/edit"
```

---

## Chunk 7: 巨大コンポーネント分割（SpaceEditForm）

### Task 14: SpaceEditForm (1,407行) → SpaceForm + サブコンポーネント

**Files:**

- Create: `BASE/spaces/_components/SpaceBasicFields.tsx`
- Create: `BASE/spaces/_components/SpaceLocationFields.tsx`
- Create: `BASE/spaces/_components/SpaceImageFields.tsx`
- Create: `BASE/spaces/_components/SpacePricingFields.tsx`
- Create: `BASE/spaces/_components/SpacePublishFields.tsx`
- Modify: `BASE/spaces/_components/SpaceEditForm.tsx` → `SpaceForm.tsx` に改名
- Modify: `BASE/spaces/new/page.tsx`
- Modify: `BASE/spaces/[id]/edit/page.tsx`

- [ ] **Step 1: SpaceEditForm.tsx を全行読んでセクション境界を特定**

フォーム内のタブ/セクションの区切りを特定する。典型的な区分:

- 基本情報（名前、スラッグ、説明、カテゴリ選択）
- 場所設定（住所、アクセス、地図）
- 画像管理（useFieldArray + dnd-kit）
- 料金設定（基本料金、オプション料金）
- 公開設定（ステータス、公開日）

- [ ] **Step 2: 各セクションをサブコンポーネントとして抽出**

各サブコンポーネントは `UseFormReturn` を prop で受け取る:

```tsx
type SpaceBasicFieldsProps = {
  form: UseFormReturn<SpaceFormInput>;
};
```

共通パターン: `form.register`, `form.control`, `form.formState.errors` を使用。

- [ ] **Step 3: SpaceForm.tsx を作成（SpaceEditForm を改名 + space? prop 追加）**

```tsx
type SpaceFormProps = {
  space?: SpaceData;
};

export function SpaceForm({ space }: SpaceFormProps) {
  const isEdit = !!space;
  // useFormAction + サブコンポーネントを配置
}
```

- [ ] **Step 4: new/page.tsx と [id]/edit/page.tsx を更新**

`SpaceEditForm` → `SpaceForm` に import 変更。

- [ ] **Step 5: SpaceEditForm.tsx を削除**

```bash
git rm 'src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceEditForm.tsx'
```

- [ ] **Step 6: 各サブコンポーネントが 500 行以下であることを確認**

Glob ツールで `src/app/(admin)/admin/(dashboard)/spaces/_components/Space*.tsx` を検索し、各ファイルの行数を Read で確認する。

- [ ] **Step 7: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS

- [ ] **Step 8: コミット**

```bash
git add -A
git commit -m "refactor(admin): decompose SpaceEditForm into SpaceForm + sub-components"
```

---

## Chunk 8: 巨大コンポーネント分割（残り 3 件）

### Task 15: TermsInlineEditor (1,009行) → TermsForm + サブコンポーネント

**Files:**

- Create: `BASE/terms/_components/TermsForm.tsx`
- Create: `BASE/terms/_components/TermsContentFields.tsx`
- Create: `BASE/terms/_components/TermsPublishFields.tsx`
- Modify: `BASE/terms/new/page.tsx`
- Modify: `BASE/terms/[id]/edit/page.tsx`
- Delete: `BASE/terms/_components/TermsInlineEditor.tsx`

- [ ] **Step 1: TermsInlineEditor.tsx を全行読んでセクション境界を特定**

- [ ] **Step 2: TermsForm + サブコンポーネントに分割**

SpaceForm（Task 14）と同じパターン:

- `terms?: TermsData` prop
- `isEdit = !!terms`
- サブコンポーネントは `UseFormReturn` を受け取る

- [ ] **Step 3: ルートページを更新、旧ファイル削除**

- [ ] **Step 4: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "refactor(admin): decompose TermsInlineEditor into TermsForm + sub-components"
```

---

### Task 16: TaxonomyEditor (889行) → 分割

**Files:**

- Create: `BASE/posts/taxonomy/_components/TaxonomyTree.tsx`
- Create: `BASE/posts/taxonomy/_components/TaxonomyEditDialog.tsx`
- Create: `BASE/posts/taxonomy/_components/TaxonomyCreateDialog.tsx`
- Modify: `BASE/posts/taxonomy/_components/TaxonomyEditor.tsx` → 薄いシェルに

**注意**: TaxonomyEditor は `*Editor` 命名だが Lexical エディタではない。ただし、posts のサブルート（`posts/taxonomy/`）内のコンポーネントであり、Lexical の PostEditor とは別ファイル。分割後もツリー+ダイアログの組み合わせなので `TaxonomyManager` に改名するのが望ましいが、スコープを限定するためファイル分割のみ行い命名変更は行わない。

- [ ] **Step 1: TaxonomyEditor.tsx を全行読んで分割ポイントを特定**

典型的な区分:

- ツリー表示（カテゴリ/タグの階層表示）
- 編集ダイアログ（既存アイテムの編集フォーム）
- 作成ダイアログ（新規アイテムの作成フォーム）

- [ ] **Step 2: 各ダイアログと表示部分をサブコンポーネントに抽出**

- [ ] **Step 3: TaxonomyEditor.tsx を薄いシェルにして分割コンポーネントを import**

- [ ] **Step 4: 全サブコンポーネントが 500 行以下であることを確認**

- [ ] **Step 5: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS

- [ ] **Step 6: コミット**

```bash
git add -A
git commit -m "refactor(admin): decompose TaxonomyEditor into tree + dialog components"
```

---

### Task 17: BusinessHoursSection (643行) → 分割

**Files:**

- Create: `BASE/settings/_components/BusinessHoursGrid.tsx`
- Create: `BASE/settings/_components/HolidaySettings.tsx`
- Modify: `BASE/settings/_components/BusinessHoursSection.tsx` → 薄いシェルに

- [ ] **Step 1: BusinessHoursSection.tsx を全行読んで分割ポイントを特定**

典型的な区分:

- 曜日別営業時間グリッド
- 休日設定（祝日・特別休業）

- [ ] **Step 2: 各セクションをサブコンポーネントに抽出**

- [ ] **Step 3: BusinessHoursSection.tsx を薄いシェルに**

- [ ] **Step 4: 型チェック + テスト**

Run: `bun run type-check && bun run test`
Expected: PASS

- [ ] **Step 5: コミット**

```bash
git add -A
git commit -m "refactor(admin): decompose BusinessHoursSection into grid + holiday components"
```

---

## Chunk 9: 最終検証

### Task 18: フル検証 + 成功基準チェック

- [ ] **Step 1: validate + build**

Run: `bun run validate && bun run build`
Expected: PASS

- [ ] **Step 2: テスト**

Run: `bun run test`
Expected: 全テスト PASS

- [ ] **Step 3: 成功基準チェックリスト**

以下を grep/find で確認:

```bash
# 1. 全リソースに loading.tsx が存在（15件、space-categories 除外）
find 'src/app/(admin)/admin/(dashboard)' -maxdepth 2 -name 'loading.tsx' | wc -l
# Expected: 15+ (dashboard ルートの loading.tsx も含む)

# 2. 全リソースに error.tsx が存在
find 'src/app/(admin)/admin/(dashboard)' -maxdepth 2 -name 'error.tsx' | wc -l

# 3. EditForm パターンが 0 件
find 'src/app/(admin)' -name '*EditForm*' | grep -v node_modules
# Expected: 0 件（staff の InviteForm/UserForm は EditForm ではないので OK）

# 4. 500行超の _components ファイルが 0 件（Lexical 除外）
find 'src/app/(admin)/admin/(dashboard)' -path '*/_components/*.tsx' -not -path '*/editor/*' -exec sh -c 'lines=$(wc -l < "$1") && [ "$lines" -gt 500 ] && echo "$lines $1"' _ {} \;
# Expected: 0 件

# 5. Simple ActionCell が 0 件
for name in CustomerActionCell CouponActionCell LocationActionCell SpaceActionCell InquiryActionCell ReservationActionCell; do
  find 'src/app/(admin)' -name "${name}.tsx" 2>/dev/null
done
# Expected: 0 件

# 6. ListPageHeader 使用確認
grep -rl 'ListPageHeader' 'src/app/(admin)/admin/(dashboard)' --include='*.tsx' | wc -l
# Expected: 14+
```

- [ ] **Step 4: 不備があれば修正してコミット**

- [ ] **Step 5: 完了**
