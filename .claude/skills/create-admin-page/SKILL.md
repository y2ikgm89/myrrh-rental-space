---
name: create-admin-page
description: >
  管理画面の CRUD ページ一式を admin-ui-patterns.md 準拠でスキャフォールド生成する。
  新しいリソース（モデル）を管理画面に追加する際に使用。
  引数: リソース名（英語 camelCase, 例: product, spaceCategory, staffMember）
---

# 管理画面 CRUD スキャフォールド

このスキルは管理画面に新しいリソースを追加する際の全ファイルを生成します。
`admin-ui-patterns.md`、`nuqs-patterns.md`、`error-handling.md` の標準パターンに完全準拠します。

**Post / News のような Lexical インラインエディタ + `UnifiedSidePanel` の新規コンテンツ種別**は本スキルの CRUD テンプレートではなく、`docs/reference/codex-rules/admin-inline-editor-patterns.md`（`.claude/rules/frontend/admin-inline-editor-patterns.md` と同一）および既存の `content-types/post.tsx` / `news.tsx` を複製・改変して追加する。

## 実行前の確認事項

生成前に必ず以下を確認する（不明な場合は AskUserQuestion で確認）:

1. **リソース名**: 英語 camelCase（例: `coupon`, `spaceCategory`）
2. **Prisma モデル名**: 同名または異なる場合（例: `Coupon`）
3. **主要フィールド**: 一覧表示に使うカラム（name, title, status 等）
4. **権限設定**: `executeAdminMutationResult` の resource 名（通常リソース名と同じ）
5. **既存 Server Action**: `_shared/actions/` に既存ファイルがあるか確認
6. **ルートパス**: `/admin/<resource>` のパス（複数形が一般的）

### フォームパターン（標準と例外）

- **標準（本スキルが生成する `<Resource>Form.tsx`）**: `useFormAction` + react-hook-form + `standardSchemaResolver`（`admin-ui-patterns.md`）。
- **例外が必要なとき**（DnD・複数 `useFieldArray`・メディアピッカー等で `FormData` 経路が有利な場合）: `admin-ui-patterns.md` の「**useFormAction 非適用の例外**」を読み、**参照実装**として `SpaceEditForm` / `submitSpaceFormAction` / `@/admin/lib/space-form-data-codec` を踏襲する（無理に `useFormAction` の単一アクションに押し込めない）。

## 生成ファイル構成

```
src/app/(admin)/admin/(dashboard)/
└── <resources>/                          # URL: /admin/<resources>
    ├── page.tsx                          # 一覧ページ（Server Component）
    ├── new/
    │   └── page.tsx                      # 新規作成ページ（Server Component）
    └── [id]/
        ├── page.tsx                      # 詳細ページ（Server Component）
        ├── edit/
        │   └── page.tsx                  # 編集ページ（Server Component）
        └── _components/
            ├── <Resource>Form.tsx        # 新規・編集共用フォーム（Client Component）
            ├── <Resource>Detail.tsx      # 詳細表示（Client Component）
            └── <Resource>ActionCell.tsx  # テーブル操作列（Client Component）
    └── _components/
        ├── <Resource>Table.tsx           # テーブル（Client Component）
        └── <Resource>Filters.tsx         # 検索・フィルター（Client Component）
```

## ページテンプレート

### 一覧ページ（`page.tsx`）

```tsx
import type { Metadata } from "next";
import { Button } from "@/shared/components/ui/button";
import Link from "next/link";
import { Suspense } from "react";
import { loadAdmin<Resource>SearchParams } from "@/shared/lib/nuqs";
import { get<Resource>List } from "@/admin/actions/<resources>";
import { <Resource>Table } from "./_components/<Resource>Table";
import type { SearchParams } from "nuqs/server";

export const metadata: Metadata = {
  title: "<Resource>管理",
};

export default async function <Resource>ListPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await loadAdmin<Resource>SearchParams(searchParams);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            <Resource>管理
          </h1>
          <p className="text-muted-foreground"><Resource>の一覧・管理</p>
        </div>
        <Button asChild>
          <Link href="/admin/<resources>/new">新規作成</Link>
        </Button>
      </div>
      <Suspense fallback={<div>読み込み中...</div>}>
        <Resource>TableWrapper params={params} />
      </Suspense>
    </div>
  );
}

async function <Resource>TableWrapper({
  params,
}: {
  params: Awaited<ReturnType<typeof loadAdmin<Resource>SearchParams>>;
}) {
  const result = await get<Resource>List({
    q: params.q,
    page: params.page,
    perPage: 10,
  });

  return (
    <<Resource>Table
      items={result.items}
      total={result.total}
      page={params.page}
    />
  );
}
```

### 詳細ページ（`[id]/page.tsx`）

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { DetailDeleteButton } from "@/admin/components/DetailDeleteButton";
import { DetailSection } from "@/admin/components/DetailSection";
import { DetailField } from "@/admin/components/DetailField";
import { Pencil } from "lucide-react";
import { Button } from "@/admin/components/ui/button";
import Link from "next/link";
import { get<Resource>ById, delete<Resource> } from "@/admin/actions/<resources>";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await get<Resource>ById(id);
  return {
    title: item ? `<Resource> — ${item.name}` : "<Resource>詳細",
  };
}

export default async function <Resource>DetailPage({ params }: Props) {
  const { id } = await params;
  const item = await get<Resource>ById(id);
  if (!item) notFound();

  return (
    <AdminDetailLayout
      backHref="/admin/<resources>"
      title={item.name}
      subtitle="<Resource>詳細"
      actions={
        <>
          <DetailDeleteButton
            itemName={item.name}
            onDelete={delete<Resource>.bind(null, id)}
            redirectTo="/admin/<resources>"
          />
          <Button asChild size="sm">
            <Link href={`/admin/<resources>/${id}/edit`}>
              <Pencil className="mr-2 h-4 w-4" />
              編集
            </Link>
          </Button>
        </>
      }
    >
      <DetailSection title="基本情報">
        <div className="grid gap-4 sm:grid-cols-2">
          <DetailField label="ID" value={item.id} />
          <DetailField label="名前" value={item.name} />
          {/* 他フィールドをここに追加 */}
        </div>
      </DetailSection>
    </AdminDetailLayout>
  );
}
```

### 編集ページ（`[id]/edit/page.tsx`）

```tsx
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { get<Resource>ById } from "@/admin/actions/<resources>";
import { <Resource>Form } from "./_components/<Resource>Form";

type Props = { params: Promise<{ id: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { id } = await params;
  const item = await get<Resource>ById(id);
  return {
    title: item ? `${item.name} — 編集` : "編集",
  };
}

export default async function <Resource>EditPage({ params }: Props) {
  const { id } = await params;
  const item = await get<Resource>ById(id);
  if (!item) notFound();

  return (
    <AdminDetailLayout
      backHref={`/admin/<resources>/${id}`}
      backLabel="詳細に戻る"
      title="<Resource>を編集"
      subtitle={item.name}
    >
      <<Resource>Form item={item} />
    </AdminDetailLayout>
  );
}
```

### 新規作成ページ（`new/page.tsx`）

```tsx
import type { Metadata } from "next";
import { AdminDetailLayout } from "@/admin/components/AdminDetailLayout";
import { <Resource>Form } from "../[id]/_components/<Resource>Form";

export const metadata: Metadata = {
  title: "新規<Resource>作成",
};

export default async function New<Resource>Page() {
  return (
    <AdminDetailLayout
      backHref="/admin/<resources>"
      title="新規<Resource>作成"
      subtitle="新しい<Resource>を登録します"
    >
      <<Resource>Form />
    </AdminDetailLayout>
  );
}
```

## コンポーネントテンプレート

### テーブル（`_components/<Resource>Table.tsx`）

```tsx
"use client";

import { useFilterParams } from "@/admin/hooks/use-filter-params";
import { PageListTable } from "@/admin/components/PageListTable";
import type { ColumnDef } from "@tanstack/react-table";
import { <Resource>ActionCell } from "./<Resource>ActionCell";

type <Resource>Row = {
  id: string;
  name: string;
  createdAt: string;
};

type Props = {
  items: <Resource>Row[];
  total: number;
  page: number;
};

const columns: ColumnDef<<Resource>Row>[] = [
  {
    accessorKey: "name",
    header: "名前",
  },
  {
    accessorKey: "createdAt",
    header: "作成日",
    cell: ({ row }) => new Date(row.original.createdAt).toLocaleDateString("ja-JP"),
  },
  {
    id: "actions",
    header: "",
    cell: ({ row }) => <<Resource>ActionCell id={row.original.id} name={row.original.name} />,
  },
];

export function <Resource>Table({ items, total, page }: Props) {
  const { params, setPage } = useFilterParams();

  return (
    <PageListTable
      columns={columns}
      data={items}
      total={total}
      page={page}
      onPageChange={(p) => void setPage(p)}
    />
  );
}
```

### フィルター（`_components/<Resource>Filters.tsx`）

```tsx
"use client";

import { useFilterParams } from "@/admin/hooks/use-filter-params";
import { Input } from "@/shared/components/ui/input";

export function <Resource>Filters() {
  const { params, setSearchDebounced } = useFilterParams({ debounceMs: 300 });

  return (
    <div className="flex items-center gap-2">
      <Input
        placeholder="検索..."
        value={params.q}
        onChange={(e) => setSearchDebounced(e.target.value)}
        className="max-w-sm"
      />
    </div>
  );
}
```

### ActionCell（`_components/<Resource>ActionCell.tsx`）

```tsx
"use client";

import { useState } from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { delete<Resource> } from "@/admin/actions/<resources>";

type Props = { id: string; name: string };

export function <Resource>ActionCell({ id, name }: Props) {
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem href={`/admin/<resources>/${id}`}>
          詳細
        </ActionDropdownItem>
        <ActionDropdownItem href={`/admin/<resources>/${id}/edit`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={name}
        onConfirm={async () => {
          await delete<Resource>(id);
        }}
      />
    </>
  );
}
```

## Server Actions テンプレート（`_shared/actions/<resources>.ts`）

`create-server-action` スキルで生成するか、以下のパターンを参照:

```typescript
"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import type { MutationResult } from "@/shared/lib/mutation-result";
import { CACHE_TAGS } from "@/shared/lib/constants";
import prisma from "@/shared/lib/prisma";
import { toPlainObject, toPlainArray } from "@/shared/lib/serialize";
import {
  <resource>FormSchema,
  type <Resource>FormInput,
} from "@/shared/lib/validations/<resource>";

export async function get<Resource>List({
  q,
  page,
  perPage,
}: {
  q: string;
  page: number;
  perPage: number;
}) {
  const where = q ? { name: { contains: q } } : {};
  const [items, total] = await Promise.all([
    prisma.<resource>.findMany({
      where,
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * perPage,
      take: perPage,
      select: { id: true, name: true, createdAt: true },
    }),
    prisma.<resource>.count({ where }),
  ]);
  return {
    items: toPlainArray(items.map((i) => ({ ...i, createdAt: i.createdAt.toISOString() }))),
    total,
  };
}

export async function get<Resource>ById(id: string) {
  const item = await prisma.<resource>.findUnique({
    where: { id },
    select: { id: true, name: true, createdAt: true, updatedAt: true },
  });
  if (!item) return null;
  return toPlainObject({ ...item, createdAt: item.createdAt.toISOString(), updatedAt: item.updatedAt.toISOString() });
}

export async function create<Resource>(
  input: <Resource>FormInput,
): Promise<MutationResult<{ id: string }>> {
  const parsed = <resource>FormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "<resource>",
    action: "create",
    execute: async () => prisma.<resource>.create({ data: parsed.data }),
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
    resolveAuditResourceId: (data) => data.id,
  });
}

export async function update<Resource>(
  id: string,
  input: <Resource>FormInput,
): Promise<MutationResult<null>> {
  const parsed = <resource>FormSchema.safeParse(input);
  if (!parsed.success) return createValidationMutationError(parsed.error);

  return executeAdminMutationResult({
    resource: "<resource>",
    action: "update",
    resourceId: id,
    execute: async () => {
      await prisma.<resource>.update({ where: { id }, data: parsed.data });
    },
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
  });
}

export async function delete<Resource>(
  id: string,
): Promise<MutationResult<null>> {
  return executeAdminMutationResult({
    resource: "<resource>",
    action: "delete",
    resourceId: id,
    execute: async () => { await prisma.<resource>.delete({ where: { id } }); },
    afterSuccess: () => { updateTag(CACHE_TAGS.<RESOURCES>); },
  });
}
```

## nuqs パーサー追加（`@/shared/lib/nuqs/parsers.ts`）

一覧ページの searchParams 用に **パーサーマップを1つ**定義し、Server と Client で同一マップを共有する（`nuqs-patterns.md` の単一ソースパターン）。

```typescript
// @/shared/lib/nuqs/parsers.ts（例: 既存の adminXxxSearchParamsParsers を踏襲）
import {
  createSearchParamsCache,
  type SearchParams,
} from "nuqs/server";

const admin<Resource>SearchParamsParsers = {
  q: parseAsQuery,
  page: parseAsPage,
  perPage: parseAsPerPage, // 一覧の take/limit と必ず一致させる
};

const admin<Resource>SearchParamsCache = createSearchParamsCache(
  admin<Resource>SearchParamsParsers,
);

export { admin<Resource>SearchParamsParsers };

export async function loadAdmin<Resource>SearchParams(
  searchParams: Promise<SearchParams>,
) {
  await admin<Resource>SearchParamsCache.parse(searchParams);
  return admin<Resource>SearchParamsCache.all();
}
```

フィルター用 Client では `useQueryStates(admin<Resource>SearchParamsParsers, ...)` と同一マップを import する。実装は `loadAdminCouponSearchParams` / `adminCouponSearchParamsParsers` 等の既存定義を参照。

## 実装手順

1. **Prisma スキーマ確認**: `prisma/schema.prisma` でモデル定義を確認
2. **nuqs パーサー追加**: `@/shared/lib/nuqs/parsers.ts` にパーサーを追加
3. **Server Actions 作成**: `create-server-action` スキルを使用または手動で作成
4. **CACHE_TAGS 追加**: `@/shared/lib/constants.ts` に新しいタグ定数を追加
5. **ページ生成**: 上記テンプレートを使用して4ページを作成
6. **コンポーネント生成**: テーブル・フィルター・ActionCell を作成
7. **検証**: `bun run validate && bun run build` で確認

## 禁止事項（admin-ui-patterns.md 準拠）

- 削除ボタンをページ最下部カードに配置（`DetailDeleteButton` をヘッダー `actions` に配置）
- 管理画面ページでの `connection()` 使用（公開ページ専用）
- `backLabel` に「<Resource>一覧に戻る」のような具体名（「一覧に戻る」のみ）
- テーブル操作列の Button+Link 直書き（`ActionDropdown` の `*ActionCell` を使用）
- `DetailDeleteButton.onDelete` にクロージャ（`.bind(null, id)` を使用）
- バックナビゲーションに `ChevronLeft` 使用禁止（`AdminDetailLayout` が `ArrowLeft` を自動提供、手動実装も `ArrowLeft` のみ）
