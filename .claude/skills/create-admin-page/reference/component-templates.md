# コンポーネントテンプレート

テーブル・フィルター・ActionCell の雛形。

## テーブル（`_components/<Resource>Table.tsx`）

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

## フィルター（`_components/<Resource>Filters.tsx`）

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

## ActionCell（`_components/<Resource>ActionCell.tsx`）

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
