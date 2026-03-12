# Admin Panel Full Cleanup Design

> 管理画面の全面リファクタリング設計書
> Date: 2026-03-13
> Status: Approved
> Scope: 全 CRUD リソース（Lexical エディタ内部を除く）

## 目的

管理画面を Next.js 16 / React 19 公式ベストプラクティスに準拠した統一構造にクリーンアップする。
後方互換性は考慮せず、破壊的変更を許容してクリーンな実装を目指す。

## スコープ

### 対象

- 16 リソースのディレクトリ構造・命名統一
- loading.tsx / error.tsx の全リソース配置
- フォームパターン統一（create/edit 兼用）
- 一覧ページヘッダー共通化
- ActionCell 共通化
- 巨大コンポーネント分割

### 対象外

- Lexical エディタ内部（`_shared/components/editor/`）— 独立サブシステム
- `_shared/lib/admin-action.ts` / `executeAdminMutationResult` — 既に良好
- `_shared/hooks/useFormAction.ts` — 既に良好
- Prisma スキーマ / マイグレーション

---

## 1. ディレクトリ構造テンプレート

### 1.1 標準 CRUD リソース

```
{resource}/
├── page.tsx              # 一覧（Server Component）
├── loading.tsx           # ルートセグメント用スケルトン
├── error.tsx             # エラーバウンダリ
├── new/
│   └── page.tsx          # 新規作成
├── [id]/
│   ├── page.tsx          # 詳細
│   └── edit/
│       └── page.tsx      # 編集
└── _components/
    ├── {Resource}Table.tsx        # テーブル（Server Component）
    ├── {Resource}Form.tsx         # create/edit 兼用フォーム
    ├── {Resource}Detail.tsx       # 詳細表示（Client Component）
    ├── {Resource}Filters.tsx      # フィルター（BaseFilters ラッパー）
    └── {Resource}ActionCell.tsx   # 行アクション（Simple は削除 → ResourceActionCell）
```

### 1.2 命名規約

| 種別         | 命名                   | 備考                                        |
| ------------ | ---------------------- | ------------------------------------------- |
| フォーム     | `{Resource}Form`       | create/edit 統一。`{Resource}EditForm` 廃止 |
| 詳細         | `{Resource}Detail`     | Client Component                            |
| テーブル     | `{Resource}Table`      | Server Component                            |
| フィルター   | `{Resource}Filters`    | BaseFilters ラッパー                        |
| 行アクション | `{Resource}ActionCell` | Complex のみ専用維持                        |
| エディター   | `*Editor`              | **Lexical 専用に予約**                      |

### 1.3 リソース分類と適用方針

#### カテゴリ A: 標準 CRUD（テンプレート完全適用）

| リソース      | 現状の問題                           | 変更内容                                       |
| ------------- | ------------------------------------ | ---------------------------------------------- |
| **customers** | Form + EditForm 分離                 | EditForm 削除 → Form 統一                      |
| **coupons**   | 既に統一 Form                        | loading.tsx 追加のみ                           |
| **locations** | list page なし（既に Form 統一済み） | loading.tsx 追加のみ                           |
| **staff**     | InviteForm + UserForm 分離           | **例外維持**: 招待と編集は本質的に異なるフロー |
| **terms**     | TermsInlineEditor (1,009行)          | Form 統一 + 巨大コンポーネント分割             |

#### カテゴリ B: Lexical ベース（エディタ命名を維持）

| リソース  | 現状                  | 変更内容                                                        |
| --------- | --------------------- | --------------------------------------------------------------- |
| **news**  | NewsEditor（Lexical） | 命名維持（Lexical エディタは `*Editor` 許容）、loading.tsx 追加 |
| **posts** | PostEditor（Lexical） | 命名維持、loading.tsx 追加                                      |

#### カテゴリ C: 特殊 UI（テンプレート部分適用）

| リソース         | 特殊性                                    | 変更内容                                             |
| ---------------- | ----------------------------------------- | ---------------------------------------------------- |
| **faq**          | インラインエディタ + カテゴリツリー       | loading.tsx 追加、FaqItemInlineEditor は維持         |
| **reservations** | Form + EditForm 分離 + カレンダー         | EditForm 削除 → Form 統一、loading.tsx 追加          |
| **spaces**       | タブ構造 + SpaceEditForm (1,407行)        | Form 統一 + 巨大コンポーネント分割、loading.tsx 追加 |
| **pages**        | マスター・ディテール + セクションエディタ | loading.tsx 追加、構造維持                           |
| **media**        | ダイアログベース CRUD                     | loading.tsx 追加、構造維持                           |
| **settings**     | シングルトン + 7 サブページ               | loading.tsx 追加、BusinessHoursSection 分割          |

#### カテゴリ D: 読み取り専用 / ダイアログのみ

| リソース             | 変更内容                               |
| -------------------- | -------------------------------------- |
| **audit-logs**       | loading.tsx 追加のみ                   |
| **inquiries**        | loading.tsx 追加のみ                   |
| **space-categories** | 変更なし（ルートなし、ダイアログのみ） |

---

## 2. 共通コンポーネント

### 2.1 ListPageHeader（新規）

一覧ページのヘッダー（タイトル + 説明 + 新規ボタン）を共通化する。

```tsx
// _shared/components/ListPageHeader.tsx — Server Component
import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/admin/components/ui/button";

type ListPageHeaderProps = {
  title: string;
  description: string;
  createHref?: string;
  createLabel?: string;
  actions?: React.ReactNode; // カスタムアクション（createHref の代替）
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

**適用対象**: audit-logs, coupons, customers, faq, inquiries, media, news, pages, posts, reservations, spaces, staff, terms（14 ページ）

### 2.2 ResourceActionCell（新規）

Simple な行アクション（リンクのみ）を共通化する。

```tsx
// _shared/components/ResourceActionCell.tsx — Client Component
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

**削除対象 ActionCell（Simple パターン）**:

- `CustomerActionCell.tsx` → テーブル内で `ResourceActionCell` をインライン使用
- `CouponActionCell.tsx` → 同上
- `LocationActionCell.tsx` → 同上
- `SpaceActionCell.tsx` → 同上
- `InquiryActionCell.tsx` → 同上
- `ReservationActionCell.tsx` → 同上

**維持対象 ActionCell（Complex パターン）**:

- `CategoryActionCell.tsx` — ダイアログ状態管理あり
- `TermsActionCell.tsx` — 公開/非公開トグルあり
- `PostActionCell.tsx` — 公開/下書きトグルあり
- `NewsActionCell.tsx` — 公開/下書きトグルあり
- `ReservationActionCell.tsx` — 削除対象に移動（実測: 25行、リンクのみの Simple パターン）

### 2.3 ResourceLoading（新規）

全リソースの `loading.tsx` を re-export で共通化する。

```tsx
// _shared/components/ResourceLoading.tsx — Server Component
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

各リソースの `loading.tsx`:

```tsx
export { default } from "../_shared/components/ResourceLoading";
```

### 2.4 ResourceError（既存 error.tsx を共通化）

```tsx
// _shared/components/ResourceError.tsx — Client Component
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

各リソースの `error.tsx`:

```tsx
export { default } from "../_shared/components/ResourceError";
```

---

## 3. フォーム統一パターン

### 3.1 統一フォーム設計

```tsx
// {Resource}Form.tsx
type {Resource}FormProps = {
  {resource}?: {Resource}Data;  // undefined = create, defined = edit
};

export function {Resource}Form({ {resource} }: {Resource}FormProps) {
  const isEdit = !!{resource};

  const { form, isPending, onSubmit } = useFormAction({
    schema: {resource}FormSchema,
    submitFn: async (data) =>
      isEdit
        ? update{Resource}({resource}.id, data)
        : create{Resource}(data),
    options: {
      defaultValues: {resource}
        ? toFormValues({resource})
        : defaultFormValues,
      redirectTo: isEdit
        ? `/admin/{resources}/${resource}.id`
        : `/admin/{resources}`,
      successMessage: isEdit ? "更新しました" : "作成しました",
    },
  });

  return (
    <form onSubmit={onSubmit}>
      {/* フォームフィールド */}
      <SubmitButton isPending={isPending} label={isEdit ? "更新" : "作成"} />
    </form>
  );
}
```

### 3.2 対象リソースと移行計画

| リソース         | 現状                                  | 移行内容                                                               |
| ---------------- | ------------------------------------- | ---------------------------------------------------------------------- |
| **customers**    | CustomerForm + CustomerEditForm       | CustomerEditForm 削除 → CustomerForm に `customer?` prop 追加          |
| **reservations** | ReservationForm + ReservationEditForm | ReservationEditForm 削除 → ReservationForm に `reservation?` prop 追加 |
| **spaces**       | SpaceEditForm (1,407行)               | SpaceForm に改名 + `space?` prop + サブコンポーネント分割              |
| **terms**        | TermsInlineEditor (1,009行)           | TermsForm に改名 + `terms?` prop + 分割                                |

### 3.3 例外（統一しないリソース）

| リソース             | 理由                                                                                     |
| -------------------- | ---------------------------------------------------------------------------------------- |
| **staff**            | 新規 = 招待フロー（InviteForm）、編集 = ユーザー情報（UserForm）。本質的に異なるフォーム |
| **news**             | Lexical エディタベース。NewsEditor 維持（エディタ名は Lexical 専用）                     |
| **posts**            | Lexical エディタベース。PostEditor 維持                                                  |
| **faq**              | FaqCategoryForm（カテゴリ）+ FaqItemInlineEditor（アイテム）。異なるエンティティ         |
| **pages**            | セクションエディタベース。構造が根本的に異なる                                           |
| **media**            | ダイアログベース。フォームページなし                                                     |
| **settings**         | シングルトン。CRUD ではない                                                              |
| **space-categories** | ダイアログベース。フォームページなし                                                     |

---

## 4. バリデーションスキーマ

**実測結果**: 全バリデーションファイルは 500 行以下（最大: `media.ts` = 302行）。分割不要。

| ファイル               | 行数 | 判定 |
| ---------------------- | ---- | ---- |
| `media.ts`             | 302  | 維持 |
| `space.ts`             | 250  | 維持 |
| `admin-reservation.ts` | 196  | 維持 |
| `post.ts`              | 167  | 維持 |
| `api-keys.ts`          | 114  | 維持 |

**アクション**: 変更なし。

---

## 5. 巨大コンポーネント分割

### 5.1 SpaceEditForm (1,407行) → SpaceForm + サブコンポーネント

```
spaces/_components/
├── SpaceForm.tsx              # 統合フォームシェル（create/edit 判別 + タブ構造）
├── SpaceBasicFields.tsx       # 基本情報（名前、説明、カテゴリ）
├── SpaceLocationFields.tsx    # 場所設定
├── SpaceImageFields.tsx       # 画像管理（useFieldArray + dnd-kit）
├── SpacePricingFields.tsx     # 料金設定
└── SpacePublishFields.tsx     # 公開設定
```

### 5.2 TermsInlineEditor (1,009行) → TermsForm + サブコンポーネント

```
terms/_components/
├── TermsForm.tsx              # 統合フォーム（create/edit 判別）
├── TermsContentFields.tsx     # コンテンツ入力
└── TermsPublishFields.tsx     # 公開設定
```

### 5.3 TaxonomyEditor (889行) → 分割

```
posts/taxonomy/_components/
├── TaxonomyTree.tsx           # ツリー表示
├── TaxonomyEditDialog.tsx     # 編集ダイアログ
└── TaxonomyCreateDialog.tsx   # 作成ダイアログ
```

### 5.4 BusinessHoursSection (643行) → 分割

```
settings/_components/
├── BusinessHoursGrid.tsx      # 曜日別時間グリッド（BusinessHoursSection から抽出）
└── HolidaySettings.tsx        # 休日設定（BusinessHoursSection から抽出）
```

---

## 6. 一覧ページテンプレート

### 6.1 標準一覧ページ構造

Next.js 16 公式推奨: Suspense で非同期コンポーネントをラップし、`loading.tsx` でルートレベルのフォールバックを提供。

```tsx
// {resource}/page.tsx
import { Suspense } from "react";
import { ListPageHeader } from "@/admin/components/ListPageHeader";
import { LoadingState } from "@/admin/components/LoadingState";
import { {Resource}Filters } from "./_components/{Resource}Filters";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "{リソース名} | Myrrh Rental Space",
};

type SearchParams = Promise<{ [key: string]: string | string[] | undefined }>;

async function {Resource}List({ searchParams }: { searchParams: SearchParams }) {
  // データ取得 + テーブル + ページネーション
}

export default async function {Resource}sPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  return (
    <div className="space-y-6">
      <ListPageHeader
        title="{リソース名}"
        description="{説明}"
        createHref="/admin/{resources}/new"
        createLabel="新規{リソース}"
      />
      <Suspense fallback={<LoadingState variant="inline" />}>
        <{Resource}Filters />
      </Suspense>
      <Suspense fallback={<LoadingState />}>
        <{Resource}List searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

---

## 7. 全変更一覧（チェックリスト）

### 7.1 新規ファイル

| ファイル                                                        | 種別               |
| --------------------------------------------------------------- | ------------------ |
| `_shared/components/ListPageHeader.tsx`                         | 共通コンポーネント |
| `_shared/components/ResourceActionCell.tsx`                     | 共通コンポーネント |
| `_shared/components/ResourceLoading.tsx`                        | 共通 loading       |
| `_shared/components/ResourceError.tsx`                          | 共通 error         |
| `{resource}/loading.tsx` x15（space-categories 除く）           | re-export          |
| `spaces/_components/SpaceBasicFields.tsx` 等 5 分割ファイル     | コンポーネント分割 |
| `terms/_components/TermsContentFields.tsx` 等 2 分割ファイル    | コンポーネント分割 |
| `posts/taxonomy/_components/TaxonomyTree.tsx` 等 3 分割ファイル | コンポーネント分割 |
| `settings/_components/BusinessHoursGrid.tsx` 等 2 分割ファイル  | コンポーネント分割 |

### 7.2 削除ファイル

| ファイル                                             | 理由                                 |
| ---------------------------------------------------- | ------------------------------------ |
| `customers/_components/CustomerEditForm.tsx`         | Form 統一                            |
| `reservations/_components/ReservationEditForm.tsx`   | Form 統一                            |
| `customers/_components/CustomerActionCell.tsx`       | ResourceActionCell に置換            |
| `coupons/_components/CouponActionCell.tsx`           | ResourceActionCell に置換            |
| `locations/_components/LocationActionCell.tsx`       | ResourceActionCell に置換            |
| `spaces/_components/SpaceActionCell.tsx`             | ResourceActionCell に置換            |
| `inquiries/_components/InquiryActionCell.tsx`        | ResourceActionCell に置換            |
| `reservations/_components/ReservationActionCell.tsx` | ResourceActionCell に置換            |
| 各リソースの個別 `error.tsx` x14                     | ResourceError re-export に置換       |
| `spaces/_components/SpaceEditForm.tsx`               | SpaceForm + サブコンポーネントに置換 |
| `terms/_components/TermsInlineEditor.tsx`            | TermsForm + サブコンポーネントに置換 |

### 7.3 修正ファイル

| ファイル                          | 変更内容                          |
| --------------------------------- | --------------------------------- |
| `customers/page.tsx`              | ListPageHeader 使用               |
| `coupons/page.tsx`                | ListPageHeader 使用               |
| `spaces/page.tsx`                 | ListPageHeader 使用               |
| `staff/page.tsx`                  | ListPageHeader 使用               |
| `news/page.tsx`                   | ListPageHeader 使用               |
| `posts/page.tsx`                  | ListPageHeader 使用               |
| `faq/page.tsx`                    | ListPageHeader 使用               |
| `reservations/page.tsx`           | ListPageHeader 使用               |
| `terms/page.tsx`                  | ListPageHeader 使用               |
| `inquiries/page.tsx`              | ListPageHeader 使用               |
| `audit-logs/page.tsx`             | ListPageHeader 使用               |
| `media/page.tsx`                  | ListPageHeader 使用               |
| `pages/page.tsx`                  | ListPageHeader 使用               |
| `settings/page.tsx`               | ListPageHeader 使用               |
| `customers/new/page.tsx`          | CustomerForm (prop なし)          |
| `customers/[id]/edit/page.tsx`    | CustomerForm (prop あり)          |
| `reservations/new/page.tsx`       | ReservationForm (prop なし)       |
| `reservations/[id]/edit/page.tsx` | ReservationForm (prop あり)       |
| `spaces/new/page.tsx`             | SpaceForm (prop なし)             |
| `spaces/[id]/edit/page.tsx`       | SpaceForm (prop あり)             |
| `terms/new/page.tsx`              | TermsForm (prop なし)             |
| `terms/[id]/edit/page.tsx`        | TermsForm (prop あり)             |
| `CustomerTable.tsx`               | ResourceActionCell インライン使用 |
| `CouponTable.tsx`                 | ResourceActionCell インライン使用 |
| `LocationTable.tsx`               | ResourceActionCell インライン使用 |
| `SpaceTable.tsx`                  | ResourceActionCell インライン使用 |
| `InquiryTable.tsx`                | ResourceActionCell インライン使用 |
| `ReservationTable.tsx`            | ResourceActionCell インライン使用 |

---

## 8. 影響しないもの（明示的除外）

- `_shared/hooks/useFormAction.ts` — 変更なし
- `_shared/lib/admin-action.ts` — 変更なし
- `_shared/actions/` — import パス変更なし（barrel export）
- `_shared/queries/` — 変更なし
- `_shared/components/editor/` — Lexical エディタ全体
- `_shared/components/AdminDetailLayout.tsx` — 既に共通化済み
- `_shared/components/ActionDropdown.tsx` — 基盤として維持
- `_shared/components/DeleteConfirmDialog.tsx` — 変更なし
- `_shared/components/EmptyState.tsx` — 変更なし
- Domain 層（`src/shared/domain/`）— 変更なし
- Prisma スキーマ — 変更なし
- 認証・認可 — 変更なし

---

## 9. 成功基準

1. `bun run validate && bun run build` がパスする
2. 全テスト（3,274件）がパスする（ActionCell / Form 変更に伴う import パス修正を含む）
3. `page.tsx` を持つ全リソースに `loading.tsx` + `error.tsx` が存在する（15 リソース、space-categories 除外）
4. `{Resource}EditForm` パターンが 0 件（staff の InviteForm/UserForm は別フロー扱いで許容）
5. 500 行超の \_components ファイルが 0 件（Lexical 除外）
6. Simple ActionCell の個別ファイルが 0 件（6 ファイル削除: Customer, Coupon, Location, Space, Inquiry, Reservation）
7. 全一覧ページが `ListPageHeader` を使用（14 ページ）
