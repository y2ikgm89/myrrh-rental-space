# ページテンプレート

`admin-ui-patterns.md` に完全準拠した 4 種のページ雛形。プレースホルダ `<Resource>` / `<resource>` / `<resources>` / `<RESOURCES>` はそれぞれ PascalCase / camelCase / URL 複数形 / CACHE_TAGS キーに置換する。

## 一覧ページ（`page.tsx`）

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

## 詳細ページ（`[id]/page.tsx`）

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

## 編集ページ（`[id]/edit/page.tsx`）

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

## 新規作成ページ（`new/page.tsx`）

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
