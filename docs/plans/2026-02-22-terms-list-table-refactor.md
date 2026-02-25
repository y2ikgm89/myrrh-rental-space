# Terms List Table Refactor Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 利用規約一覧ページを、他の管理ページ（LocationTable, CategoryTable）と一貫したテーブル形式に刷新する。

**Architecture:** `TermsList.tsx`（Client Component モノリス）を削除し、`TermsTable.tsx`（Server Component）+ `TermsActionCell.tsx`（Client Component）の分割パターンに置き換える。`isActive` 切り替えは `PublishSwitch` インライン、編集・削除は `ActionDropdown` の `TermsActionCell` に集約。`_count.spaces` を型と Action の返却値に追加してテーブルに表示する。

**Tech Stack:** Next.js 16 Server Components, `PublishSwitch`, `ActionDropdown`, `DeleteConfirmDialog`, `EmptyState`, `withPermission` HOF

---

### Task 1: `TermsWithVersion` 型に `_count` を追加

**Files:**

- Modify: `src/shared/lib/validations/terms.ts`

**Step 1: `TermsWithVersion` インターフェースに `_count` フィールドを追加**

`TermsWithVersion` インターフェース末尾に追加:

```typescript
export interface TermsWithVersion {
  id: string;
  type: TermsType;
  title: string;
  slug: string;
  isActive: boolean;
  currentVersion: {
    id: string;
    version: number;
    contentHtml: string;
    contentJson: unknown;
    publishedAt: Date;
  } | null;
  _count: {
    spaces: number;
  };
}
```

**Step 2: 型チェック実行**

```bash
bun run type-check
```

Expected: `TermsWithVersion` を返す既存コードで `_count` 欠如エラーが出る（次タスクで修正）

---

### Task 2: `getTermsList` の返却値に `_count` を含める

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`

**Step 1: `getTermsList` 内のマッピングに `_count` を追加**

`getTermsList` アクション内の `result` マッピングを以下に変更:

```typescript
const result = terms.map((t) => ({
  id: t.id,
  type: t.type,
  title: t.title,
  slug: t.slug,
  isActive: t.isActive,
  currentVersion: t.versions[0]
    ? {
        id: t.versions[0].id,
        version: t.versions[0].version,
        contentHtml: t.versions[0].contentHtml,
        contentJson: t.versions[0].contentJson,
        publishedAt: t.versions[0].publishedAt!,
      }
    : null,
  _count: {
    spaces: t._count.spaces,
  },
}));
```

注意: DB クエリの `_count` セレクトはすでに `spaces: true` を含んでいるため DB 変更不要。

**Step 2: 型チェック実行**

```bash
bun run type-check
```

Expected: `TermsWithVersion` の `_count` エラーが解消される

---

### Task 3: `toggleTermsActive` を `PublishSwitch` 互換シグネチャに変更

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts`

**Step 1: `toggleTermsActive` の実装を置き換え**

`withPermission` のジェネリクスを `[string]` → `[string, boolean]` に変更し、DB 操作を `isActive` を直接セットする形に変更:

```typescript
export const toggleTermsActive = withPermission<[string, boolean]>(
  "terms",
  "update",
)(async (_user, id, isActive): Promise<ActionResult<void>> => {
  const terms = await prisma.terms.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!terms) {
    return createFailure("規約が見つかりません");
  }

  await prisma.terms.update({
    where: { id },
    data: { isActive },
  });

  updateTag(CACHE_TAGS.TERMS);

  fireAndForget(purgeTermsCache(), {
    operation: "purgeTermsCache",
    category: ErrorCategory.EXTERNAL_API,
    severity: ErrorSeverity.LOW,
  });

  return createSuccess(
    isActive ? "規約を有効にしました" : "規約を無効にしました",
  );
});
```

**Step 2: 型チェック実行**

```bash
bun run type-check
```

Expected: `TermsList.tsx` 内の `toggleTermsActive(term.id)` 呼び出し（引数不足）でエラーが出る（次タスクで `TermsList.tsx` を削除するため問題なし）

---

### Task 4: `TermsTable.tsx` を作成（Server Component）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsTable.tsx`

**Step 1: ファイルを新規作成**

```typescript
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  PublishSwitch,
} from "@/admin/components/ui";
import { toggleTermsActive } from "@/admin/actions/terms";
import { TERMS_TYPES } from "@/shared/lib/validations/terms";
import type { TermsWithVersion } from "@/shared/lib/validations/terms";
import { EmptyState } from "@/admin/components/EmptyState";
import { TermsActionCell } from "./TermsActionCell";

type TermsTableProps = {
  terms: TermsWithVersion[];
};

export function TermsTable({ terms }: TermsTableProps) {
  if (terms.length === 0) {
    return (
      <EmptyState
        message="利用規約がまだ登録されていません"
        action={{ label: "規約を追加", href: "/admin/terms/new" }}
      />
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>タイトル</TableHead>
            <TableHead className="hidden md:table-cell">スラッグ</TableHead>
            <TableHead className="hidden md:table-cell">バージョン</TableHead>
            <TableHead className="text-center">有効/無効</TableHead>
            <TableHead className="hidden text-right md:table-cell">
              スペース数
            </TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {terms.map((term) => {
            const typeLabel =
              TERMS_TYPES.find((t) => t.value === term.type)?.label ??
              String(term.type);
            return (
              <TableRow key={term.id}>
                <TableCell>
                  <div className="font-medium">{term.title}</div>
                  <Badge variant="outline" className="mt-1 text-xs">
                    {typeLabel}
                  </Badge>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  <code className="text-sm text-muted-foreground">
                    {term.slug}
                  </code>
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {term.currentVersion ? (
                    <span className="text-sm">
                      v{term.currentVersion.version}
                    </span>
                  ) : (
                    <span className="text-sm text-warning">(未公開)</span>
                  )}
                </TableCell>
                <TableCell className="text-center">
                  <PublishSwitch
                    id={term.id}
                    isPublished={term.isActive}
                    onToggle={toggleTermsActive}
                    label={{ published: "有効", unpublished: "無効" }}
                  />
                </TableCell>
                <TableCell className="hidden text-right md:table-cell">
                  <Badge variant="secondary">{term._count.spaces}件</Badge>
                </TableCell>
                <TableCell className="text-right">
                  <TermsActionCell
                    id={term.id}
                    title={term.title}
                    spacesCount={term._count.spaces}
                  />
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </div>
  );
}
```

---

### Task 5: `TermsActionCell.tsx` を作成（Client Component）

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsActionCell.tsx`

**Step 1: ファイルを新規作成**

```typescript
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { deleteTerms } from "@/admin/actions/terms";

type TermsActionCellProps = {
  id: string;
  title: string;
  spacesCount: number;
};

export function TermsActionCell({
  id,
  title,
  spacesCount,
}: TermsActionCellProps) {
  const router = useRouter();
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isDeletePending, startDeleteTransition] = useTransition();

  const handleDelete = () => {
    startDeleteTransition(async () => {
      const result = await deleteTerms(id);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem href={`/admin/terms/${id}/edit`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          disabled={spacesCount > 0}
          onClick={() => setIsDeleteOpen(true)}
        >
          {spacesCount > 0 ? `削除 (${spacesCount}件のスペースあり)` : "削除"}
        </ActionDropdownItem>
      </ActionDropdown>

      <DeleteConfirmDialog
        open={isDeleteOpen}
        onOpenChange={setIsDeleteOpen}
        itemName={title}
        onConfirm={handleDelete}
        isPending={isDeletePending}
      />
    </>
  );
}
```

---

### Task 6: `page.tsx` を `TermsTable` に切り替え、`TermsList.tsx` を削除

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/terms/page.tsx`
- Delete: `src/app/(admin)/admin/(dashboard)/terms/_components/TermsList.tsx`

**Step 1: `page.tsx` のインポートと使用箇所を `TermsTable` に変更**

```typescript
import { Suspense } from "react";
import Link from "next/link";
import { getTermsList } from "@/admin/actions/terms";
import { TermsTable } from "./_components/TermsTable";
import { Button } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import type { Metadata } from "next";
import { connection } from "next/server";

export const metadata: Metadata = {
  title: "利用規約管理 | Myrrh Rental Space",
};

async function TermsListContent() {
  const result = await getTermsList();
  if (!result.success) {
    return (
      <div className="rounded-lg border bg-card p-12 text-center">
        <p className="text-destructive">{result.error}</p>
      </div>
    );
  }
  return <TermsTable terms={result.data ?? []} />;
}

export default async function TermsPage() {
  await connection();
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">
            利用規約管理
          </h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            スペースに紐づける利用規約を管理します。バージョン管理により変更履歴を追跡できます。
          </p>
        </div>
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/terms/new">規約を追加</Link>
        </Button>
      </div>
      <Suspense fallback={<LoadingState />}>
        <TermsListContent />
      </Suspense>
    </div>
  );
}
```

**Step 2: `TermsList.tsx` を削除**

```bash
git rm "src/app/(admin)/admin/(dashboard)/terms/_components/TermsList.tsx"
```

---

### Task 7: 検証とコミット

**Step 1: 型チェックとリント**

```bash
bun run validate
```

Expected: エラーなし

**Step 2: ビルド確認**

```bash
bun run build
```

Expected: エラーなし

**Step 3: コミット**

```bash
git add \
  "src/shared/lib/validations/terms.ts" \
  "src/app/(admin)/admin/(dashboard)/_shared/actions/terms.ts" \
  "src/app/(admin)/admin/(dashboard)/terms/_components/TermsTable.tsx" \
  "src/app/(admin)/admin/(dashboard)/terms/_components/TermsActionCell.tsx" \
  "src/app/(admin)/admin/(dashboard)/terms/page.tsx"

git commit -m "refactor(terms): 一覧ページをテーブル形式に刷新

- TermsList(クライアントモノリス)→TermsTable(Server)+TermsActionCell(Client)に分割
- PublishSwitchインラインでisActive切り替え
- ActionDropdownで編集・削除を統一
- _count.spacesを型とActionに追加してテーブル表示"
```
