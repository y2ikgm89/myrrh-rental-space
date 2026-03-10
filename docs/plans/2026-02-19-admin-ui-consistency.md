# Admin UI/UX 一貫性統一 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 管理画面の全一覧ページを統一されたパターン（ヘッダー・テーブル・フィルター・EmptyState・Pagination）に揃え、一貫したUX・保守性を実現する

**Architecture:** 破壊的変更OK。各一覧ページはヘッダー→フィルター(Suspense)→テーブル+ページネーション(Suspense)の標準構造に統一。staff/audit-logsは分散ファイル構造に抽出。フィルターは全て nuqs リアクティブ方式に統一。

**Tech Stack:** Next.js 16 Server Components, React 19, nuqs 2.x, Tailwind CSS 4, TypeScript 6.0-beta

**設計書:** `docs/plans/2026-02-19-admin-ui-consistency-design.md`

---

## 事前確認

```bash
bun run validate
```

エラーがゼロであることを確認してから開始する。

---

## Task 1: CSS クラス修正 — 5 ページのヘッダー統一

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/coupons/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/inquiries/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/faq/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/spaces/page.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/pages/page.tsx`

**標準ヘッダークラス（基準）:**

```tsx
// reservations/page.tsx が正しい基準
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold">タイトル</h1>
    <p className="text-sm text-muted-foreground sm:text-base">説明文</p>
  </div>
  <Button asChild className="min-h-10 sm:min-h-9">
    ...
  </Button>
</div>
```

**Step 1: coupons/page.tsx を修正**

変更前:

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold">クーポン管理</h1>
    <p className="text-muted-foreground">
      クーポンの作成・管理を行います
    </p>
  </div>
  <Button asChild>
```

変更後:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold">クーポン管理</h1>
    <p className="text-sm text-muted-foreground sm:text-base">
      クーポンの作成・管理を行います
    </p>
  </div>
  <Button asChild className="min-h-10 sm:min-h-9">
```

**Step 2: inquiries/page.tsx を修正**

変更前:

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold">お問い合わせ管理</h1>
    <p className="text-muted-foreground">
      お問い合わせの確認・ステータス管理を行います
    </p>
  </div>
</div>
```

変更後:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold">お問い合わせ管理</h1>
    <p className="text-sm text-muted-foreground sm:text-base">
      お問い合わせの確認・ステータス管理を行います
    </p>
  </div>
</div>
```

**Step 3: faq/page.tsx を修正**

変更前:

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold">FAQ管理</h1>
    <p className="text-muted-foreground">
      よくある質問のカテゴリと質問を管理します
    </p>
  </div>
  <div className="flex gap-2">
    <Button variant="outline" asChild>
      <Link href="/admin/faq/categories/new">カテゴリ追加</Link>
    </Button>
    <Button asChild>
      <Link href="/admin/faq/items/new">質問追加</Link>
    </Button>
  </div>
</div>
```

変更後:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold">FAQ管理</h1>
    <p className="text-sm text-muted-foreground sm:text-base">
      よくある質問のカテゴリと質問を管理します
    </p>
  </div>
  <div className="flex gap-2">
    <Button variant="outline" asChild className="min-h-10 sm:min-h-9">
      <Link href="/admin/faq/categories/new">カテゴリ追加</Link>
    </Button>
    <Button asChild className="min-h-10 sm:min-h-9">
      <Link href="/admin/faq/items/new">質問追加</Link>
    </Button>
  </div>
</div>
```

**Step 4: spaces/page.tsx を修正**

変更前:

```tsx
<div>
  <h1 className="text-2xl font-bold">スペース管理</h1>
  <p className="text-muted-foreground">
    スペース・場所・カテゴリーを一元管理します
  </p>
</div>
```

変更後:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold">スペース管理</h1>
    <p className="text-sm text-muted-foreground sm:text-base">
      スペース・場所・カテゴリーを一元管理します
    </p>
  </div>
</div>
```

**Step 5: pages/page.tsx を修正**

変更前:

```tsx
<div className="flex items-center justify-between">
  <div>
    <h1 className="text-2xl font-bold">ページ管理</h1>
    <p className="text-muted-foreground">公開ページのコンテンツ・SEO設定</p>
  </div>
  <div className="flex items-center gap-2">
    <DeletedPagesDialog />
    <CreatePageDialog />
  </div>
</div>
```

変更後:

```tsx
<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
  <div>
    <h1 className="text-2xl font-bold">ページ管理</h1>
    <p className="text-sm text-muted-foreground sm:text-base">
      公開ページのコンテンツ・SEO設定
    </p>
  </div>
  <div className="flex items-center gap-2">
    <DeletedPagesDialog />
    <CreatePageDialog />
  </div>
</div>
```

**Step 6: 型チェック**

```bash
bun run type-check
```

Expected: エラーなし

**Step 7: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/coupons/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/inquiries/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/faq/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/spaces/page.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/pages/page.tsx
git commit -m "style(admin): unify page header layout to sm:flex-row responsive pattern"
```

---

## Task 2: PageListTable — テーブルラッパー修正

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/pages/_components/PageListTable.tsx`

**Step 1: overflow-hidden を追加**

変更前:

```tsx
<div className="rounded-lg border bg-card">
```

変更後:

```tsx
<div className="overflow-hidden rounded-lg border bg-card">
```

**Step 2: 型チェック＋コミット**

```bash
bun run type-check
git add src/app/\(admin\)/admin/\(dashboard\)/pages/_components/PageListTable.tsx
git commit -m "fix(admin/pages): add missing overflow-hidden to table wrapper"
```

---

## Task 3: status-badges.tsx — RoleBadge・AuditActionBadge を追加

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/components/status-badges.tsx`

現在の `staff/page.tsx` にインラインで定義されている `RoleBadge` と `audit-logs/page.tsx` にインラインで定義されている `ActionBadge` を status-badges.tsx に移動する。

**Step 1: 必要な型インポートを確認**

`AuditAction` は `@/shared/generated/prisma/enums`、`Role` は同じくenums から。

**Step 2: status-badges.tsx にコードを追加**

ファイル末尾に以下を追加（既存コードはそのまま）:

```tsx
// =============================================================================
// 追加インポート（ファイル先頭の import type ブロックに追加）
// =============================================================================
// import type { Role, AuditAction } from '@/shared/generated/prisma/enums'
// ↑ 既存の import type { CustomerStatus, ... } の行に Role, AuditAction を追加

// =============================================================================
// Role Configuration
// =============================================================================

const roleConfig = {
  SUPER_ADMIN: { label: "スーパー管理者", variant: "destructive" },
  ADMIN: { label: "管理者", variant: "default" },
  EDITOR: { label: "編集者", variant: "secondary" },
  VIEWER: { label: "閲覧者", variant: "outline" },
  USER: { label: "ユーザー", variant: "outline" },
} satisfies Record<Role, { label: string; variant: BadgeVariant }>;

export function RoleBadge({ role }: { role: Role }) {
  const config = roleConfig[role];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}

// =============================================================================
// AuditAction Configuration
// =============================================================================

const auditActionConfig = {
  CREATE: { label: "作成", variant: "default" },
  UPDATE: { label: "更新", variant: "secondary" },
  DELETE: { label: "削除", variant: "destructive" },
  PUBLISH: { label: "公開", variant: "default" },
  UNPUBLISH: { label: "非公開", variant: "outline" },
  LOGIN_SUCCESS: { label: "ログイン成功", variant: "default" },
  LOGIN_FAILED: { label: "ログイン失敗", variant: "destructive" },
  PERMISSION_DENIED: { label: "権限拒否", variant: "destructive" },
  PASSWORD_CHANGE: { label: "パスワード変更", variant: "secondary" },
  ROLE_CHANGE: { label: "ロール変更", variant: "secondary" },
} satisfies Record<AuditAction, { label: string; variant: BadgeVariant }>;

export function AuditActionBadge({ action }: { action: AuditAction }) {
  const config = auditActionConfig[action];
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

具体的な変更手順：

1. ファイル先頭の `import type { CustomerStatus, InquiryStatus, ReservationStatus, PostStatus, CouponType }` に `Role, AuditAction` を追加
2. ファイル末尾に `roleConfig`・`RoleBadge`・`auditActionConfig`・`AuditActionBadge` を追加

**Step 3: 型チェック＋コミット**

```bash
bun run type-check
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/components/status-badges.tsx
git commit -m "feat(admin): add RoleBadge and AuditActionBadge to status-badges.tsx"
```

---

## Task 4: use-filter-params.ts — useDebouncedCallback をエクスポート

CouponFilters が同じデバウンスロジックを重複実装しているため、共有フックからエクスポートする。

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/_shared/hooks/use-filter-params.ts`
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/hooks/index.ts`

**Step 1: use-filter-params.ts で function → export function に変更**

変更前:

```tsx
function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number
): (value: string) => void {
```

変更後:

```tsx
export function useDebouncedCallback(
  callback: (value: string) => void,
  delayMs: number
): (value: string) => void {
```

**Step 2: hooks/index.ts に追加**

変更前:

```tsx
// Filter
export { useFilterParams } from "./use-filter-params";
export { useFilterParamsWithCategory } from "./use-filter-params";
export type { FilterParams, UseFilterParamsOptions } from "./use-filter-params";
```

変更後:

```tsx
// Filter
export {
  useFilterParams,
  useFilterParamsWithCategory,
  useDebouncedCallback,
} from "./use-filter-params";
export type { FilterParams, UseFilterParamsOptions } from "./use-filter-params";
```

**Step 3: 型チェック＋コミット**

```bash
bun run type-check
git add src/app/\(admin\)/admin/\(dashboard\)/_shared/hooks/use-filter-params.ts \
        src/app/\(admin\)/admin/\(dashboard\)/_shared/hooks/index.ts
git commit -m "refactor(admin/hooks): export useDebouncedCallback for reuse"
```

---

## Task 5: CouponFilters.tsx — 自前デバウンス → useDebouncedCallback

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/coupons/_components/CouponFilters.tsx`

**Step 1: 完全書き換え**

```tsx
"use client";

import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Search, X } from "lucide-react";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

export function CouponFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      status: parseAsString.withDefault(""),
      type: parseAsString.withDefault(""),
      page: parseAsInteger.withDefault(1),
    },
    { history: "push", shallow: false },
  );

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  const clearFilters = () => {
    void setParams({ search: null, status: null, type: null, page: 1 });
  };

  const hasFilters = params.status || params.type || params.search;

  return (
    <div className="flex flex-wrap items-center gap-3">
      <div className="w-full sm:w-[140px]">
        <Select
          value={params.status || "ALL"}
          onValueChange={(value) =>
            void setParams({ status: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="ステータス" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="active">有効</SelectItem>
            <SelectItem value="inactive">無効</SelectItem>
            <SelectItem value="expired">期限切れ</SelectItem>
            <SelectItem value="limitReached">上限到達</SelectItem>
            <SelectItem value="notStarted">期間前</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="w-full sm:w-[160px]">
        <Select
          value={params.type || "ALL"}
          onValueChange={(value) =>
            void setParams({ type: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="割引タイプ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="PERCENTAGE">パーセント割引</SelectItem>
            <SelectItem value="FIXED_AMOUNT">定額割引</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="relative flex-1 min-w-[200px]">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="コード・名称で検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>

      {hasFilters && (
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          <X className="mr-1 h-4 w-4" />
          クリア
        </Button>
      )}
    </div>
  );
}
```

**Step 2: 型チェック＋コミット**

```bash
bun run type-check
git add src/app/\(admin\)/admin/\(dashboard\)/coupons/_components/CouponFilters.tsx
git commit -m "refactor(admin/coupons): replace manual debounce with useDebouncedCallback"
```

---

## Task 6: staff/\_components/ — 4 ファイル新規作成

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffStats.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffFilters.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/staff/_components/StaffTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/staff/_components/InvitationTable.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/staff/_components/index.ts`

**Step 1: StaffStats.tsx を作成**

```tsx
import { getUserStats } from "@/admin/actions/user";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";

export async function StaffStats() {
  const stats = await getUserStats();

  return (
    <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総スタッフ数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.total}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">管理者</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.admins}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">一般スタッフ</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.users}</div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            新規（30日以内）
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">{stats.recentUsers}</div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: StaffFilters.tsx を作成**

```tsx
"use client";

import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import { Search } from "lucide-react";
import { useDebouncedCallback } from "@/admin/hooks";
import {
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";

export function StaffFilters() {
  const [params, setParams] = useQueryStates(
    {
      search: parseAsString.withDefault(""),
      role: parseAsString.withDefault("ALL"),
      page: parseAsInteger.withDefault(1),
    },
    { history: "push", shallow: false },
  );

  const setSearchDebounced = useDebouncedCallback(
    (value: string) => void setParams({ search: value || null, page: 1 }),
    300,
  );

  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
      <div className="relative flex-1">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          placeholder="名前・メールアドレスで検索..."
          defaultValue={params.search}
          onChange={(e) => setSearchDebounced(e.target.value)}
          className="pl-9"
        />
      </div>
      <div className="w-full sm:w-[180px]">
        <Select
          value={params.role}
          onValueChange={(value) =>
            void setParams({ role: value === "ALL" ? null : value, page: 1 })
          }
        >
          <SelectTrigger>
            <SelectValue placeholder="ロール" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべて</SelectItem>
            <SelectItem value="SUPER_ADMIN">スーパー管理者</SelectItem>
            <SelectItem value="ADMIN">管理者</SelectItem>
            <SelectItem value="EDITOR">編集者</SelectItem>
            <SelectItem value="VIEWER">閲覧者</SelectItem>
          </SelectContent>
        </Select>
      </div>
    </div>
  );
}
```

**Step 3: StaffTable.tsx を作成**

```tsx
import Link from "next/link";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { RoleBadge } from "@/admin/components/status-badges";
import { UserActions } from "./UserActions";
import { formatDateShort } from "@/shared/lib/utils";
import type { getUsers } from "@/admin/actions/user";

type StaffUser = Awaited<ReturnType<typeof getUsers>>["users"][number];

type StaffTableProps = {
  users: StaffUser[];
};

export function StaffTable({ users }: StaffTableProps) {
  if (users.length === 0) {
    return <EmptyState message="スタッフが見つかりません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>名前</TableHead>
            <TableHead>メールアドレス</TableHead>
            <TableHead>ロール</TableHead>
            <TableHead className="hidden md:table-cell">予約数</TableHead>
            <TableHead className="hidden md:table-cell">記事数</TableHead>
            <TableHead className="hidden lg:table-cell">登録日</TableHead>
            <TableHead className="text-right">操作</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {users.map((user) => (
            <TableRow key={user.id}>
              <TableCell>
                <Link
                  href={`/admin/staff/${user.id}`}
                  className="font-medium hover:underline"
                >
                  {user.name ?? "(未設定)"}
                </Link>
              </TableCell>
              <TableCell>{user.email}</TableCell>
              <TableCell>
                <RoleBadge role={user.role} />
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {user._count.reservations}
              </TableCell>
              <TableCell className="hidden md:table-cell">
                {user._count.posts}
              </TableCell>
              <TableCell className="hidden lg:table-cell">
                {formatDateShort(user.createdAt)}
              </TableCell>
              <TableCell className="text-right">
                <UserActions user={user} />
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 4: InvitationTable.tsx を作成**

```tsx
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { RoleBadge } from "@/admin/components/status-badges";
import { InvitationActions } from "./InvitationActions";
import { formatDateTimeShort, formatDateShort } from "@/shared/lib/utils";
import type { getPendingInvitations } from "@/admin/actions/staff-invitation";

type PendingInvitation = Awaited<
  ReturnType<typeof getPendingInvitations>
>[number];

type InvitationTableProps = {
  invitations: PendingInvitation[];
};

export function InvitationTable({ invitations }: InvitationTableProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium">招待中</span>
        <Badge variant="secondary">{invitations.length}</Badge>
      </div>
      <div className="overflow-hidden rounded-lg border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>メールアドレス</TableHead>
              <TableHead>名前</TableHead>
              <TableHead>ロール</TableHead>
              <TableHead className="hidden md:table-cell">有効期限</TableHead>
              <TableHead className="hidden md:table-cell">招待日</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {invitations.map((invitation) => (
              <TableRow key={invitation.id}>
                <TableCell>{invitation.email}</TableCell>
                <TableCell>{invitation.name ?? "(未設定)"}</TableCell>
                <TableCell>
                  <RoleBadge role={invitation.role} />
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDateTimeShort(invitation.expiresAt)}
                </TableCell>
                <TableCell className="hidden md:table-cell">
                  {formatDateShort(invitation.createdAt)}
                </TableCell>
                <TableCell className="text-right">
                  <InvitationActions invitation={invitation} />
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
```

**Step 5: staff/\_components/index.ts を作成**

```ts
export { StaffStats } from "./StaffStats";
export { StaffFilters } from "./StaffFilters";
export { StaffTable } from "./StaffTable";
export { InvitationTable } from "./InvitationTable";
export { UserActions } from "./UserActions";
export { InvitationActions } from "./InvitationActions";
```

**Step 6: 型チェック**

```bash
bun run type-check
```

エラーが出た場合は `getUsers` の戻り値型を確認して StaffTable の型定義を調整する。

**Step 7: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/staff/_components/StaffStats.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/staff/_components/StaffFilters.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/staff/_components/StaffTable.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/staff/_components/InvitationTable.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/staff/_components/index.ts
git commit -m "feat(admin/staff): extract StaffStats, StaffFilters, StaffTable, InvitationTable components"
```

---

## Task 7: staff/page.tsx — 完全書き換え

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/staff/page.tsx`

**Step 1: 完全書き換え**

```tsx
import { Suspense } from "react";
import Link from "next/link";
import { getUsers } from "@/admin/actions/user";
import { getPendingInvitations } from "@/admin/actions/staff-invitation";
import { loadAdminUserSearchParams } from "@/shared/lib/nuqs";
import { getRoleFilterOrAll } from "@/shared/lib/validations/enums";
import { Button, Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import {
  StaffStats,
  StaffFilters,
  StaffTable,
  InvitationTable,
} from "./_components";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "スタッフ管理 | Myrrh Rental Space",
};

// =============================================================================
// URL パラメータバリデーション
// =============================================================================

type SortBy = "name" | "email" | "role" | "createdAt";
type SortOrder = "asc" | "desc";

const VALID_SORT_BY = new Set<string>(["name", "email", "role", "createdAt"]);

function validateSortBy(value: string): SortBy {
  return VALID_SORT_BY.has(value) ? (value as SortBy) : "createdAt";
}

function validateSortOrder(value: string): SortOrder {
  return value === "asc" || value === "desc" ? value : "desc";
}

// =============================================================================
// 非同期データコンポーネント
// =============================================================================

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function StaffList({ searchParams }: PageProps) {
  const params = await loadAdminUserSearchParams(searchParams);
  const result = await getUsers({
    page: params.page,
    perPage: params.perPage,
    search: params.search || undefined,
    role: getRoleFilterOrAll(params.role),
    sortBy: validateSortBy(params.sortBy),
    sortOrder: validateSortOrder(params.sortOrder),
  });

  return (
    <>
      <StaffTable users={result.users} />
      <Pagination
        currentPage={result.page}
        totalPages={result.totalPages}
        total={result.total}
      />
    </>
  );
}

async function InvitationSection() {
  const invitations = await getPendingInvitations();
  if (invitations.length === 0) return null;
  return <InvitationTable invitations={invitations} />;
}

// =============================================================================
// メインページ
// =============================================================================

export default async function StaffPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">スタッフ管理</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            管理画面にアクセスできるスタッフアカウントを管理します
          </p>
        </div>
        <Button asChild className="min-h-10 sm:min-h-9">
          <Link href="/admin/staff/new">スタッフを招待</Link>
        </Button>
      </div>

      {/* スタッツカード */}
      <Suspense
        fallback={
          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border bg-card p-6 animate-pulse"
              >
                <div className="h-4 bg-muted rounded w-20 mb-3" />
                <div className="h-8 bg-muted rounded w-12" />
              </div>
            ))}
          </div>
        }
      >
        <StaffStats />
      </Suspense>

      {/* 招待中 */}
      <Suspense fallback={null}>
        <InvitationSection />
      </Suspense>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <StaffFilters />
      </Suspense>

      {/* テーブル + ページネーション */}
      <Suspense fallback={<LoadingState />}>
        <StaffList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

**Step 2: 型チェック**

```bash
bun run type-check
```

エラーが出た場合: `getUsers` の引数型を `src/app/(admin)/admin/(dashboard)/_shared/actions/user.ts` で確認して調整する。

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/staff/page.tsx
git commit -m "refactor(admin/staff): extract components, remove Card wrapping, use Suspense architecture"
```

---

## Task 8: audit-logs/\_components/ — 2 ファイル作成 + AuditLogFilters 書き換え

**Files:**

- Create: `src/app/(admin)/admin/(dashboard)/audit-logs/_components/AuditLogStats.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/audit-logs/_components/AuditLogTable.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/audit-logs/_components/AuditLogFilters.tsx`

**Step 1: AuditLogStats.tsx を作成**

```tsx
import { getAuditLogStats } from "@/admin/actions/audit-log";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui";

export async function AuditLogStats() {
  const statsResult = await getAuditLogStats();
  const stats =
    statsResult.success && "data" in statsResult
      ? statsResult.data
      : {
          total: 0,
          today: 0,
          securityEvents: 0,
          byAction: {} as Record<string, number>,
        };

  return (
    <div className="grid gap-4 md:grid-cols-4">
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">総ログ数</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.total.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">本日</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.today.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">
            セキュリティイベント
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {stats.securityEvents.toLocaleString()}
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-sm font-medium">作成操作</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="text-2xl font-bold">
            {(stats.byAction["CREATE"] ?? 0).toLocaleString()}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

**Step 2: AuditLogTable.tsx を作成**

```tsx
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { AuditActionBadge } from "@/admin/components/status-badges";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { getAuditLogs } from "@/admin/actions/audit-log";

type AuditLogData = Extract<
  Awaited<ReturnType<typeof getAuditLogs>>,
  { success: true }
>["data"];
type AuditLogEntry = AuditLogData["logs"][number];

type AuditLogTableProps = {
  logs: AuditLogEntry[];
};

export function AuditLogTable({ logs }: AuditLogTableProps) {
  if (logs.length === 0) {
    return <EmptyState message="ログが見つかりません" />;
  }

  return (
    <div className="overflow-hidden rounded-lg border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>日時</TableHead>
            <TableHead>ユーザー</TableHead>
            <TableHead>アクション</TableHead>
            <TableHead>リソース</TableHead>
            <TableHead className="hidden md:table-cell">リソースID</TableHead>
            <TableHead className="hidden lg:table-cell">IPアドレス</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {logs.map((log) => (
            <TableRow key={log.id}>
              <TableCell className="whitespace-nowrap">
                {formatDateTimeShort(log.createdAt)}
              </TableCell>
              <TableCell>
                {log.user?.name ?? log.user?.email ?? "(システム)"}
              </TableCell>
              <TableCell>
                <AuditActionBadge action={log.action} />
              </TableCell>
              <TableCell>{log.resource}</TableCell>
              <TableCell className="hidden md:table-cell font-mono text-xs">
                {log.resourceId?.slice(0, 8) ?? "-"}
              </TableCell>
              <TableCell className="hidden lg:table-cell font-mono text-xs">
                {(log.metadata as { ipAddress?: string } | null)?.ipAddress ??
                  "-"}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
```

**Step 3: AuditLogFilters.tsx — フォームsubmit → リアクティブ nuqs に書き換え**

```tsx
"use client";

import { useQueryStates, parseAsString, parseAsInteger } from "nuqs";
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { AuditAction } from "@/shared/generated/prisma/enums";

const ACTION_OPTIONS: { value: AuditAction | "ALL"; label: string }[] = [
  { value: "ALL", label: "すべて" },
  { value: "CREATE", label: "作成" },
  { value: "UPDATE", label: "更新" },
  { value: "DELETE", label: "削除" },
  { value: "PUBLISH", label: "公開" },
  { value: "UNPUBLISH", label: "非公開" },
  { value: "LOGIN_SUCCESS", label: "ログイン成功" },
  { value: "LOGIN_FAILED", label: "ログイン失敗" },
  { value: "PERMISSION_DENIED", label: "権限拒否" },
  { value: "PASSWORD_CHANGE", label: "パスワード変更" },
  { value: "ROLE_CHANGE", label: "ロール変更" },
];

const RESOURCE_OPTIONS = [
  { value: "ALL", label: "すべて" },
  { value: "space", label: "スペース" },
  { value: "reservation", label: "予約" },
  { value: "customer", label: "顧客" },
  { value: "inquiry", label: "お問い合わせ" },
  { value: "post", label: "投稿" },
  { value: "news", label: "お知らせ" },
  { value: "page", label: "固定ページ" },
  { value: "faq", label: "FAQ" },
  { value: "settings", label: "設定" },
  { value: "user", label: "ユーザー" },
  { value: "auth", label: "認証" },
];

export function AuditLogFilters() {
  const [params, setParams] = useQueryStates(
    {
      page: parseAsInteger.withDefault(1),
      action: parseAsString.withDefault(""),
      resource: parseAsString.withDefault(""),
      dateFrom: parseAsString.withDefault(""),
      dateTo: parseAsString.withDefault(""),
    },
    { history: "push", shallow: false },
  );

  const hasFilters =
    params.action || params.resource || params.dateFrom || params.dateTo;

  const handleReset = () => {
    void setParams({
      action: null,
      resource: null,
      dateFrom: null,
      dateTo: null,
      page: 1,
    });
  };

  return (
    <div className="flex flex-wrap gap-3">
      <Select
        value={params.action || "ALL"}
        onValueChange={(value) =>
          void setParams({ action: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="アクション" />
        </SelectTrigger>
        <SelectContent>
          {ACTION_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Select
        value={params.resource || "ALL"}
        onValueChange={(value) =>
          void setParams({ resource: value === "ALL" ? null : value, page: 1 })
        }
      >
        <SelectTrigger className="w-[180px]">
          <SelectValue placeholder="リソース" />
        </SelectTrigger>
        <SelectContent>
          {RESOURCE_OPTIONS.map((opt) => (
            <SelectItem key={opt.value} value={opt.value}>
              {opt.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Input
        type="date"
        value={params.dateFrom}
        onChange={(e) =>
          void setParams({ dateFrom: e.target.value || null, page: 1 })
        }
        className="w-[160px]"
        placeholder="開始日"
      />

      <Input
        type="date"
        value={params.dateTo}
        onChange={(e) =>
          void setParams({ dateTo: e.target.value || null, page: 1 })
        }
        className="w-[160px]"
        placeholder="終了日"
      />

      {hasFilters && (
        <Button variant="ghost" onClick={handleReset}>
          クリア
        </Button>
      )}
    </div>
  );
}
```

**Step 4: 型チェック**

```bash
bun run type-check
```

`AuditLogData` の型抽出でエラーが出た場合は `getAuditLogs` のシグネチャを確認し、型定義を調整する（`ActionSuccess<T>` の構造に合わせる）。

**Step 5: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/audit-logs/_components/AuditLogStats.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/audit-logs/_components/AuditLogTable.tsx \
        src/app/\(admin\)/admin/\(dashboard\)/audit-logs/_components/AuditLogFilters.tsx
git commit -m "feat(admin/audit-logs): extract AuditLogStats, AuditLogTable; make filters reactive"
```

---

## Task 9: audit-logs/page.tsx — 完全書き換え

**Files:**

- Modify: `src/app/(admin)/admin/(dashboard)/audit-logs/page.tsx`

**Step 1: 完全書き換え**

```tsx
import { Suspense } from "react";
import { getAuditLogs } from "@/admin/actions/audit-log";
import { loadAdminAuditLogSearchParams } from "@/shared/lib/nuqs";
import { getAuditActionFilterOrAll } from "@/shared/lib/validations/enums";
import { Pagination } from "@/admin/components/ui";
import { LoadingState } from "@/admin/components/LoadingState";
import { AuditLogStats } from "./_components/AuditLogStats";
import { AuditLogTable } from "./_components/AuditLogTable";
import { AuditLogFilters } from "./_components/AuditLogFilters";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "監査ログ | Myrrh Rental Space",
};

type PageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

async function AuditLogList({ searchParams }: PageProps) {
  const params = await loadAdminAuditLogSearchParams(searchParams);
  const logsResult = await getAuditLogs({
    page: params.page,
    perPage: params.perPage,
    action: getAuditActionFilterOrAll(params.action),
    resource: params.resource || undefined,
    userId: params.userId || undefined,
    dateFrom: params.dateFrom || undefined,
    dateTo: params.dateTo || undefined,
  });

  const logs =
    logsResult.success && "data" in logsResult
      ? logsResult.data
      : { logs: [], total: 0, page: 1, totalPages: 1 };

  return (
    <>
      <AuditLogTable logs={logs.logs} />
      <Pagination
        currentPage={logs.page}
        totalPages={logs.totalPages}
        total={logs.total}
      />
    </>
  );
}

export default async function AuditLogsPage({ searchParams }: PageProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold">監査ログ</h1>
          <p className="text-sm text-muted-foreground sm:text-base">
            システム操作の履歴を確認します
          </p>
        </div>
      </div>

      {/* スタッツカード */}
      <Suspense
        fallback={
          <div className="grid gap-4 md:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-lg border bg-card p-6 animate-pulse"
              >
                <div className="h-4 bg-muted rounded w-20 mb-3" />
                <div className="h-8 bg-muted rounded w-12" />
              </div>
            ))}
          </div>
        }
      >
        <AuditLogStats />
      </Suspense>

      {/* フィルター */}
      <Suspense fallback={<LoadingState variant="inline" />}>
        <AuditLogFilters />
      </Suspense>

      {/* テーブル + ページネーション */}
      <Suspense fallback={<LoadingState />}>
        <AuditLogList searchParams={searchParams} />
      </Suspense>
    </div>
  );
}
```

**Step 2: 型チェック**

```bash
bun run type-check
```

**Step 3: コミット**

```bash
git add src/app/\(admin\)/admin/\(dashboard\)/audit-logs/page.tsx
git commit -m "refactor(admin/audit-logs): remove Card wrapping, use Suspense architecture"
```

---

## Task 10: 最終検証

**Step 1: validate (type-check + lint)**

```bash
bun run validate
```

Expected: 全エラー 0。lint エラーが出た場合は対処してから進む。

**Step 2: ビルド確認**

```bash
bun run build
```

Expected: ビルド成功。エラーがあれば修正する。

**Step 3: 動作確認チェックリスト**

ブラウザで以下のページを手動確認する:

- [ ] `/admin/reservations` — フィルター・テーブル・ページネーション動作確認（基準ページ）
- [ ] `/admin/coupons` — フィルター（ステータス・タイプ・検索・クリア）リアクティブ動作確認
- [ ] `/admin/inquiries` — ヘッダーレスポンシブ確認
- [ ] `/admin/faq` — ヘッダーレスポンシブ確認
- [ ] `/admin/spaces` — ヘッダーレスポンシブ確認
- [ ] `/admin/pages` — overflow-hidden によるテーブル角丸確認
- [ ] `/admin/staff` — stats・招待テーブル（あれば）・フィルター・テーブル・ページネーション確認
- [ ] `/admin/audit-logs` — stats・フィルター（リアクティブ）・テーブル・ページネーション確認

**Step 4: 最終コミット（必要であれば残余修正後）**

```bash
bun run validate && bun run build
git add -A
git commit -m "chore(admin): finalize UI consistency unification"
```

---

## 変更サマリー

| カテゴリ        | ファイル数 | 主な内容                                                    |
| --------------- | ---------- | ----------------------------------------------------------- |
| CSS修正         | 5          | ヘッダー `flex-col → sm:flex-row`、説明文クラス統一         |
| テーブル修正    | 1          | `overflow-hidden` 追加                                      |
| バッジ追加      | 1          | `RoleBadge`・`AuditActionBadge` を status-badges.tsx へ集約 |
| フック改善      | 2          | `useDebouncedCallback` エクスポート                         |
| CouponFilters   | 1          | 自前 setTimeout 除去 → 共有フック使用                       |
| staff 分割      | 5          | 新規4コンポーネント + page.tsx 書き換え                     |
| audit-logs 分割 | 3          | 新規2コンポーネント + page.tsx 書き換え                     |
| AuditLogFilters | 1          | form-submit → nuqs リアクティブ                             |
| **合計**        | **19**     |                                                             |
