# Admin Table Action Dropdown 統一実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 全管理画面テーブルの操作列を `[⋮]` DropdownMenu パターンに統一し、操作性・保守性を向上させる。

**Architecture:** 共通 `ActionDropdown` コンポーネント（`_shared/components/ActionDropdown.tsx`）を新規作成し、全テーブルの `*ActionCell` コンポーネントがこれを使うように変更。Inline 操作（PublishSwitch・ReservationStatusSelect）は現状維持。破壊的変更 OK。

**Tech Stack:** React 19 / Next.js 16 / `'use client'` / lucide-react / `@/admin/components/ui`（DropdownMenu, Button）/ `DeleteConfirmDialog`（既存）

---

## 対象ファイル一覧

### 新規作成

- `src/app/(admin)/admin/(dashboard)/_shared/components/ActionDropdown.tsx`
- `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/locations/_components/LocationActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponActionCell.tsx`

### 修正

- `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`
- `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerTable.tsx`
- `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryTable.tsx`
- `src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx`
- `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx`
- `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponTable.tsx`
- `src/app/(admin)/admin/(dashboard)/news/_components/NewsActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/posts/_components/PostActionCell.tsx`
- `src/app/(admin)/admin/(dashboard)/staff/_components/UserActions.tsx`
- `src/app/(admin)/admin/(dashboard)/pages/_components/PageActions.tsx`

### 削除

- `src/app/(admin)/admin/(dashboard)/coupons/[id]/_components/CouponDeleteButton.tsx`（テーブルに統合後、詳細ページでも不要になるか確認してから削除）

---

## Phase 1: ActionDropdown 共通コンポーネント作成

### Task 1: ActionDropdown.tsx を作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/_shared/components/ActionDropdown.tsx`

**Step 1: ファイルを作成する**

````tsx
"use client";

import Link from "next/link";
import { MoreHorizontal } from "lucide-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui";

// =============================================================================
// Types
// =============================================================================

type ActionDropdownProps = {
  children: React.ReactNode;
  disabled?: boolean;
};

type ActionDropdownItemProps = {
  href?: string;
  onClick?: () => void;
  destructive?: boolean;
  disabled?: boolean;
  children: React.ReactNode;
};

// =============================================================================
// Components
// =============================================================================

/**
 * 管理画面テーブル行の操作メニュー共通コンポーネント
 *
 * @example
 * ```tsx
 * <ActionDropdown>
 *   <ActionDropdownItem href={`/admin/spaces/${id}/edit`}>編集</ActionDropdownItem>
 *   <ActionDropdownItem href={`/admin/spaces/${id}`}>詳細</ActionDropdownItem>
 *   <ActionDropdownSeparator />
 *   <ActionDropdownItem destructive onClick={() => setDeleteOpen(true)}>削除</ActionDropdownItem>
 * </ActionDropdown>
 * ```
 */
export function ActionDropdown({ children, disabled }: ActionDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled}>
          <MoreHorizontal className="h-4 w-4" />
          <span className="sr-only">操作メニューを開く</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">{children}</DropdownMenuContent>
    </DropdownMenu>
  );
}

export function ActionDropdownItem({
  href,
  onClick,
  destructive = false,
  disabled = false,
  children,
}: ActionDropdownItemProps) {
  const className = destructive
    ? "text-destructive focus:text-destructive"
    : undefined;

  if (href) {
    return (
      <DropdownMenuItem asChild disabled={disabled} className={className}>
        <Link href={href}>{children}</Link>
      </DropdownMenuItem>
    );
  }

  return (
    <DropdownMenuItem
      onClick={onClick}
      disabled={disabled}
      className={className}
    >
      {children}
    </DropdownMenuItem>
  );
}

export { DropdownMenuSeparator as ActionDropdownSeparator };
````

**Step 2: type-check を実行して確認する**

```bash
bun run type-check
```

Expected: エラーなし（新規ファイルのみ）

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/ActionDropdown.tsx
git commit -m "feat(admin): add ActionDropdown shared component for table actions"
```

---

## Phase 2: シンプルなテーブルの ActionCell 作成と Table 修正

テスト戦略: 各 ActionCell は UI コンポーネントのため単体テスト不要。`bun run validate` で型チェック + lint を確認。

### Task 2: ReservationActionCell を作成し ReservationTable を修正

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/reservations/_components/ReservationTable.tsx`

**Step 1: ReservationActionCell.tsx を作成する**

```tsx
"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type ReservationActionCellProps = {
  reservationId: string;
};

export function ReservationActionCell({
  reservationId,
}: ReservationActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/reservations/${reservationId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/reservations/${reservationId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**Step 2: ReservationTable.tsx を修正する**

操作列を以下のように変更する（`Button` + `Link` を削除し `ReservationActionCell` に置き換え）：

変更前:

```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-2">
    <ReservationStatusSelect
      reservationId={reservation.id}
      currentStatus={reservation.status}
    />
    <Button variant="outline" size="sm" asChild>
      <Link href={`/admin/reservations/${reservation.id}`}>詳細</Link>
    </Button>
  </div>
</TableCell>
```

変更後:

```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-2">
    <ReservationStatusSelect
      reservationId={reservation.id}
      currentStatus={reservation.status}
    />
    <ReservationActionCell reservationId={reservation.id} />
  </div>
</TableCell>
```

import 追加:

```tsx
import { ReservationActionCell } from "./ReservationActionCell";
```

import 削除（不要になったもの）:

```tsx
import Link from "next/link"; // 削除
// Button は他で使用していないか確認して削除
```

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/reservations/_components/
git commit -m "feat(admin/reservations): replace detail button with ActionDropdown (edit + detail)"
```

---

### Task 3: CustomerActionCell を作成し CustomerTable を修正

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/customers/_components/CustomerTable.tsx`

**Step 1: CustomerActionCell.tsx を作成する**

```tsx
"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type CustomerActionCellProps = {
  customerId: string;
};

export function CustomerActionCell({ customerId }: CustomerActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/customers/${customerId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/customers/${customerId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**Step 2: CustomerTable.tsx を修正する**

変更前:

```tsx
<TableCell>
  <Button asChild variant="outline" size="sm">
    <Link href={`/admin/customers/${customer.id}`}>詳細</Link>
  </Button>
</TableCell>
```

変更後:

```tsx
<TableCell>
  <CustomerActionCell customerId={customer.id} />
</TableCell>
```

import 追加:

```tsx
import { CustomerActionCell } from "./CustomerActionCell";
```

import 削除（不要になったもの）:

```tsx
import Link from 'next/link'  // 削除
import { Button, ... } from '@/admin/components/ui'  // Button を削除（他で使用なければ import ごと削除）
```

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/customers/_components/
git commit -m "feat(admin/customers): replace detail button with ActionDropdown (edit + detail)"
```

---

### Task 4: InquiryActionCell を作成し InquiryTable を修正

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/_components/InquiryTable.tsx`

**Step 1: InquiryActionCell.tsx を作成する**

お問い合わせは編集ページが存在しないため詳細のみ。

```tsx
"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type InquiryActionCellProps = {
  inquiryId: string;
};

export function InquiryActionCell({ inquiryId }: InquiryActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/inquiries/${inquiryId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**Step 2: InquiryTable.tsx を修正する**

変更前:

```tsx
<TableCell>
  <Button asChild variant="outline" size="sm">
    <Link href={`/admin/inquiries/${inquiry.id}`}>詳細</Link>
  </Button>
</TableCell>
```

変更後:

```tsx
<TableCell>
  <InquiryActionCell inquiryId={inquiry.id} />
</TableCell>
```

import 追加:

```tsx
import { InquiryActionCell } from "./InquiryActionCell";
```

import 削除:

```tsx
import Link from 'next/link'  // 削除
import { Button, ... } from '@/admin/components/ui'  // Button 削除
```

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/inquiries/_components/
git commit -m "feat(admin/inquiries): replace detail button with ActionDropdown"
```

---

### Task 5: LocationActionCell を作成し LocationTable を修正

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/locations/_components/LocationTable.tsx`

**Step 1: LocationActionCell.tsx を作成する**

```tsx
"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type LocationActionCellProps = {
  locationId: string;
};

export function LocationActionCell({ locationId }: LocationActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/locations/${locationId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/locations/${locationId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**Step 2: LocationTable.tsx を修正する**

変更前:

```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-2">
    <Button variant="outline" size="sm" asChild>
      <Link href={`/admin/locations/${location.id}`}>詳細</Link>
    </Button>
    <Button variant="outline" size="sm" asChild>
      <Link href={`/admin/locations/${location.id}/edit`}>編集</Link>
    </Button>
  </div>
</TableCell>
```

変更後:

```tsx
<TableCell className="text-right">
  <LocationActionCell locationId={location.id} />
</TableCell>
```

import 追加:

```tsx
import { LocationActionCell } from "./LocationActionCell";
```

import 削除:

```tsx
import Link from "next/link"; // 削除
// Button を import から削除（PublishSwitch は ui から、Button が不要になれば）
```

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/locations/_components/
git commit -m "feat(admin/locations): replace detail+edit buttons with ActionDropdown"
```

---

### Task 6: SpaceActionCell を作成し SpaceTable を修正

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/_components/SpaceTable.tsx`

**Step 1: SpaceActionCell.tsx を作成する**

```tsx
"use client";

import {
  ActionDropdown,
  ActionDropdownItem,
} from "@/admin/components/ActionDropdown";

type SpaceActionCellProps = {
  spaceId: string;
};

export function SpaceActionCell({ spaceId }: SpaceActionCellProps) {
  return (
    <ActionDropdown>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}/edit`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownItem href={`/admin/spaces/${spaceId}`}>
        詳細
      </ActionDropdownItem>
    </ActionDropdown>
  );
}
```

**Step 2: SpaceTable.tsx を修正する**

変更前:

```tsx
<TableCell className="text-right">
  <div className="flex items-center justify-end gap-2">
    <Button variant="outline" size="sm" asChild>
      <Link href={`/admin/spaces/${space.id}`}>詳細</Link>
    </Button>
    <Button variant="outline" size="sm" asChild>
      <Link href={`/admin/spaces/${space.id}/edit`}>編集</Link>
    </Button>
  </div>
</TableCell>
```

変更後:

```tsx
<TableCell className="text-right">
  <SpaceActionCell spaceId={space.id} />
</TableCell>
```

import 追加:

```tsx
import { SpaceActionCell } from "./SpaceActionCell";
```

import 削除:

```tsx
import Link from "next/link"; // 削除
// Button を削除（他で使っていなければ）
```

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/spaces/_components/
git commit -m "feat(admin/spaces): replace detail+edit buttons with ActionDropdown"
```

---

## Phase 3: Coupon（削除ダイアログ付き）

### Task 7: CouponActionCell を作成し CouponTable を修正

クーポンの「編集」は `/admin/coupons/{id}`（edit 専用ページなし。`/[id]` が編集ページ）。
削除は `deleteCoupon` Server Action を使い、テーブルでは `router.refresh()` で更新する。
`DeleteConfirmDialog` を使用する。

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponActionCell.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponTable.tsx`

**Step 1: CouponActionCell.tsx を作成する**

```tsx
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
import { deleteCoupon } from "@/admin/actions/coupon";

type CouponActionCellProps = {
  couponId: string;
  couponCode: string;
};

export function CouponActionCell({
  couponId,
  couponCode,
}: CouponActionCellProps) {
  const router = useRouter();
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deleteCoupon(couponId);
      if (result.success) {
        setDeleteDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem href={`/admin/coupons/${couponId}`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          onClick={() => setDeleteDialogOpen(true)}
        >
          削除
        </ActionDropdownItem>
      </ActionDropdown>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        title="クーポンを削除しますか？"
        description={`クーポン「${couponCode}」を削除します。この操作は取り消せません。`}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
```

**Step 2: CouponTable.tsx を修正する**

変更前:

```tsx
<TableCell>
  <Button asChild variant="outline" size="sm">
    <Link href={`/admin/coupons/${coupon.id}`}>編集</Link>
  </Button>
</TableCell>
```

変更後:

```tsx
<TableCell>
  <CouponActionCell couponId={coupon.id} couponCode={coupon.code} />
</TableCell>
```

import 追加:

```tsx
import { CouponActionCell } from "./CouponActionCell";
```

import 削除:

```tsx
import Link from "next/link"; // 削除
// Button 削除（他で使用なければ）
```

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/coupons/_components/
git commit -m "feat(admin/coupons): add ActionDropdown with edit + delete (table-level delete)"
```

---

## Phase 4: News / Post ActionCell リファクタ

既存の「編集ボタン + ⋮ドロップダウン」を「⋮ドロップダウンのみ（編集を内包）」に変更。

### Task 8: NewsActionCell をリファクタ

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/news/_components/NewsActionCell.tsx`

**Step 1: NewsActionCell.tsx を書き換える**

変更前: `[編集]` Button + `[⋮]`（公開切替のみ）
変更後: `[⋮]`（編集 + セパレーター + 公開切替）

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { publishNews, unpublishNews } from "@/admin/actions/news";

type NewsActionCellProps = {
  newsId: string;
  isPublished: boolean;
};

export function NewsActionCell({ newsId, isPublished }: NewsActionCellProps) {
  const [isPending, startTransition] = useTransition();

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishNews(newsId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleUnpublish = () => {
    startTransition(async () => {
      const result = await unpublishNews(newsId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/news/${newsId}`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownSeparator />
      {isPublished ? (
        <ActionDropdownItem onClick={handleUnpublish}>
          下書きに戻す
        </ActionDropdownItem>
      ) : (
        <ActionDropdownItem onClick={handlePublish}>
          公開する
        </ActionDropdownItem>
      )}
    </ActionDropdown>
  );
}
```

**Step 2: NewsTable.tsx の操作列 div を確認して不要な wrapper を削除する**

`NewsTable.tsx` で `NewsActionCell` を `<div className="flex ...">` でラップしていた場合は削除する。

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/news/_components/NewsActionCell.tsx
git commit -m "refactor(admin/news): move edit into ActionDropdown, remove standalone button"
```

---

### Task 9: PostActionCell をリファクタ

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/posts/_components/PostActionCell.tsx`

**Step 1: PostActionCell.tsx を書き換える**

```tsx
"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { publishPost, unpublishPost } from "@/admin/actions/post";
import { PostStatus } from "@/shared/generated/prisma/enums";

type PostActionCellProps = {
  postId: string;
  status: PostStatus;
};

export function PostActionCell({ postId, status }: PostActionCellProps) {
  const [isPending, startTransition] = useTransition();

  const handlePublish = () => {
    startTransition(async () => {
      const result = await publishPost(postId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleUnpublish = () => {
    startTransition(async () => {
      const result = await unpublishPost(postId);
      if (result.success) {
        toast.success(result.message);
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/posts/${postId}`}>
        編集
      </ActionDropdownItem>
      <ActionDropdownSeparator />
      {status === PostStatus.PUBLISHED ? (
        <ActionDropdownItem onClick={handleUnpublish}>
          下書きに戻す
        </ActionDropdownItem>
      ) : (
        <ActionDropdownItem onClick={handlePublish}>
          公開する
        </ActionDropdownItem>
      )}
    </ActionDropdown>
  );
}
```

**Step 2: PostTable.tsx の操作列 div を確認して不要な wrapper を削除する**

**Step 3: type-check を実行する**

```bash
bun run type-check
```

**Step 4: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/posts/_components/PostActionCell.tsx
git commit -m "refactor(admin/posts): move edit into ActionDropdown, remove standalone button"
```

---

## Phase 5: UserActions（スタッフ）リファクタ

### Task 10: UserActions をリファクタ

トリガーを「操作」テキストボタン → `MoreHorizontal` アイコンボタンに変更。
内部ロジック（削除・ロール変更ダイアログ）は維持。`ActionDropdown` に移行。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/_components/UserActions.tsx`

**Step 1: UserActions.tsx を書き換える**

```tsx
"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import {
  Button,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  deleteUser,
  updateUserRole,
  type UserData,
} from "@/admin/actions/user";
import { Role, isAdminRole } from "@/admin/lib/role-guards";

type Props = {
  user: UserData;
};

export function UserActions({ user }: Props) {
  const router = useRouter();
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [roleDialogOpen, setRoleDialogOpen] = useState(false);
  const [isUpdatingRole, setIsUpdatingRole] = useState(false);

  async function handleDelete() {
    setIsDeleting(true);
    try {
      const result = await deleteUser(user.id);
      if (result.success) {
        setDeleteDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsDeleting(false);
    }
  }

  async function handleRoleChange(newRole: Role) {
    setIsUpdatingRole(true);
    try {
      const result = await updateUserRole(user.id, newRole);
      if (result.success) {
        setRoleDialogOpen(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    } finally {
      setIsUpdatingRole(false);
    }
  }

  const newRole = isAdminRole(user.role) ? Role.USER : Role.ADMIN;
  const newRoleLabel = isAdminRole(user.role) ? "ユーザー" : "管理者";

  return (
    <>
      <ActionDropdown>
        <ActionDropdownItem href={`/admin/staff/${user.id}`}>
          詳細
        </ActionDropdownItem>
        <ActionDropdownItem href={`/admin/staff/${user.id}/edit`}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem onClick={() => setRoleDialogOpen(true)}>
          {newRoleLabel}に変更
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          onClick={() => setDeleteDialogOpen(true)}
        >
          削除
        </ActionDropdownItem>
      </ActionDropdown>

      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={user.name ?? user.email}
        onConfirm={handleDelete}
        isPending={isDeleting}
      />

      <Dialog open={roleDialogOpen} onOpenChange={setRoleDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>ロールを変更</DialogTitle>
            <DialogDescription>
              {user.name ?? user.email} を{newRoleLabel}に変更しますか？
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => setRoleDialogOpen(false)}
              disabled={isUpdatingRole}
            >
              キャンセル
            </Button>
            <Button
              onClick={() => handleRoleChange(newRole)}
              disabled={isUpdatingRole}
            >
              {isUpdatingRole ? "変更中..." : "変更"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
```

**Step 2: type-check を実行する**

```bash
bun run type-check
```

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/staff/_components/UserActions.tsx
git commit -m "refactor(admin/staff): migrate UserActions to ActionDropdown, icon trigger"
```

---

## Phase 6: PageActions リファクタ

### Task 11: PageActions をリファクタ

`AlertDialog` を `DeleteConfirmDialog` に置き換え、トリガーを `ActionDropdown` に統一。
アイコン（Eye, EyeOff, Trash2, ExternalLink）は削除（他のメニュー項目にはアイコンがないため統一感を保つ）。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/_components/PageActions.tsx`

**Step 1: PageActions.tsx を書き換える**

```tsx
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
import { deletePage, togglePagePublished } from "@/admin/actions/page";

type PageActionsProps = {
  slug: string;
  title: string;
  isPublished: boolean;
  isSystemPage?: boolean;
  isHomepage?: boolean;
};

export function PageActions({
  slug,
  title,
  isPublished,
  isSystemPage = false,
  isHomepage = false,
}: PageActionsProps) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);

  const handleTogglePublished = () => {
    startTransition(async () => {
      const result = await togglePagePublished(slug);
      if (result.success) {
        toast.success(result.message);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  const handleDelete = () => {
    startTransition(async () => {
      const result = await deletePage(slug);
      if (result.success) {
        toast.success(result.message);
        setShowDeleteDialog(false);
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem
          onClick={() => window.open(isHomepage ? "/" : `/${slug}`, "_blank")}
        >
          プレビュー
        </ActionDropdownItem>

        {!isHomepage && (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem
              onClick={handleTogglePublished}
              disabled={isPending}
            >
              {isPublished ? "非公開にする" : "公開する"}
            </ActionDropdownItem>
          </>
        )}

        {!isSystemPage && !isHomepage && (
          <>
            <ActionDropdownSeparator />
            <ActionDropdownItem
              destructive
              disabled={isPending}
              onClick={() => setShowDeleteDialog(true)}
            >
              削除
            </ActionDropdownItem>
          </>
        )}
      </ActionDropdown>

      <DeleteConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title="ページを削除しますか？"
        description={`「${title}」（/${slug}）を削除します。この操作は後から復元できます。`}
        onConfirm={handleDelete}
        isPending={isPending}
      />
    </>
  );
}
```

**Step 2: type-check を実行する**

```bash
bun run type-check
```

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/pages/_components/PageActions.tsx
git commit -m "refactor(admin/pages): migrate PageActions to ActionDropdown + DeleteConfirmDialog"
```

---

## Phase 7: 最終検証

### Task 12: validate + build を実行して完了確認

**Step 1: 全体の型チェックと lint を実行する**

```bash
bun run validate
```

Expected: 全通過

**Step 2: ビルドを実行する**

```bash
bun run build
```

Expected: 全通過

**Step 3: エラーがあれば修正してから最終コミット**

```bash
git add -p  # 変更内容を確認してから追加
git commit -m "fix(admin): resolve validate/build errors from action dropdown unification"
```

---

## 補足: `_shared/components` の import パス

`ActionDropdown` は `_shared/components/ActionDropdown.tsx` に作成するため、
import パスは `@/admin/components/ActionDropdown` になる（プロジェクトの `@/admin` エイリアスが
`src/app/(admin)/admin/(dashboard)/_shared` を指すため）。

各 `*ActionCell` での import:

```tsx
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
```

`DeleteConfirmDialog` の import:

```tsx
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
```
