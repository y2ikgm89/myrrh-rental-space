---
description: ActionDropdown 操作列パターン（外部リンク / Dialog 起動 / インライン制御共存 / 禁止 Button+Link 直書き）
paths:
  - src/app/(admin)/**/*ActionCell*.tsx
  - src/admin/components/ActionDropdown*.tsx
  - src/admin/components/DeleteConfirmDialog.tsx
---

# テーブル操作列 ActionDropdown パターン

> 管理画面の全テーブル操作列は `ActionDropdown`（`[⋮]` アイコン）に統一する。

## 基本パターン（`*ActionCell` コンポーネント）

各テーブルに専用の `*ActionCell` コンポーネントを作成する:

```tsx
// 配置例: reservations/_components/ReservationActionCell.tsx
import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

export function ReservationActionCell({ id }: { id: string }) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/reservations/${id}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/reservations/${id}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

## 外部リンク（`target="_blank"`）

`ActionDropdownItem` は Next.js `<Link>` を使うため `target="_blank"` が使えない。`window.open()` で対処:

```tsx
// NG: href に外部URL（target="_blank" 不可）
<ActionDropdownItem href={externalUrl}>外部リンク</ActionDropdownItem>

// OK: window.open() で新タブ（noreferrer は noopener を内包する仕様のため単独で十分）
<ActionDropdownItem onClick={() => window.open(url, '_blank', 'noreferrer')}>
  外部リンク
</ActionDropdownItem>
```

## Dialog 起動型アクションセル

ダイアログを開くアクションは `*ActionCell` コンポーネント内で `useState` を管理する:

```tsx
"use client";
import { useState } from "react";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";

export function CategoryActionCell({ id, name }: { id: string; name: string }) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem onClick={() => setEditOpen(true)}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <EditDialog open={editOpen} onOpenChange={setEditOpen} id={id} />
      <DeleteConfirmDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        itemName={name}
        onConfirm={async () => {
          await deleteItem(id);
        }}
      />
    </>
  );
}
```

## インライン制御との共存

`PublishSwitch`・`StatusSelect` 等のインラインコントロールは ActionDropdown と**共存**させる（吸収しない）:

```tsx
// OK: インライン制御 + ActionDropdown 共存
<div className="flex items-center gap-2">
  <PublishSwitch id={id} isPublished={isPublished} />
  <SpaceActionCell id={id} />
</div>
```

## 禁止パターン

```tsx
// NG: テーブル操作列への Button+Link 直書き
<Button asChild size="sm" variant="outline">
  <Link href={`/admin/items/${id}/edit`}>編集</Link>
</Button>

// OK: ActionDropdown 統一（*ActionCell 経由）
<ItemActionCell id={id} />
```
