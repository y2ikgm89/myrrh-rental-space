# イベントカレンダー Phase 1 — コンポーネント完全実装監査

**Date**: 2026-04-01  
**Purpose**: イベントカレンダー管理画面の CRUD ページ実装に必要な既存コンポーネント・パターンの完全コード調査

---

## 1. 管理画面テーブル層コンポーネント

### 1.1 PostTable.tsx — チェックボックス付きテーブル（完全コード）

```tsx
"use client";

import { useState } from "react";
import {
  Badge,
  Table,
  TableBody,
  TableCell,
  TableRow,
} from "@/admin/components/ui";
import { EmptyState } from "@/admin/components/EmptyState";
import { PostStatusBadge } from "@/admin/components/status-badges";
import { PostActionCell } from "./PostActionCell";
import { PostTableHeader } from "./PostTableHeader";
import { PostBulkActions } from "./PostBulkActions";
import { formatDateTimeShort } from "@/shared/lib/utils";
import type { PostListData } from "@/shared/domain/posts/types";

type PostTableProps = {
  posts: PostListData[];
};

export function PostTable({ posts }: PostTableProps) {
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const allIds = posts.map((p) => p.id);
  const allSelected =
    allIds.length > 0 && allIds.every((id) => selectedIds.includes(id));

  const toggleAll = () => {
    if (allSelected) {
      setSelectedIds([]);
    } else {
      setSelectedIds(allIds);
    }
  };

  const toggleOne = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id],
    );
  };

  if (posts.length === 0) {
    return (
      <EmptyState
        message="投稿がありません"
        action={{ label: "新規作成", href: "/admin/posts/new" }}
      />
    );
  }

  return (
    <>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <Table>
            <PostTableHeader
              allSelected={allSelected}
              onToggleAll={toggleAll}
            />
            <TableBody>
              {posts.map((post) => (
                <TableRow key={post.id}>
                  <TableCell>
                    <input
                      type="checkbox"
                      checked={selectedIds.includes(post.id)}
                      onChange={() => toggleOne(post.id)}
                      className="rounded border-border"
                      aria-label={`${post.title}を選択`}
                    />
                  </TableCell>
                  <TableCell className="whitespace-nowrap">
                    <PostStatusBadge status={post.status} />
                  </TableCell>
                  <TableCell>
                    <div>
                      <div className="max-w-xs truncate font-medium">
                        {post.title}
                      </div>
                      <div className="text-xs text-muted-foreground truncate">
                        /{post.slug}
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell">
                    <Badge variant="outline">{post.category.name}</Badge>
                  </TableCell>
                  <TableCell className="hidden text-right text-muted-foreground lg:table-cell">
                    {post.viewCount.toLocaleString()}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground md:table-cell">
                    {post.publishedAt
                      ? formatDateTimeShort(post.publishedAt)
                      : "-"}
                  </TableCell>
                  <TableCell className="hidden text-muted-foreground lg:table-cell">
                    {formatDateTimeShort(post.createdAt)}
                  </TableCell>
                  <TableCell>
                    <PostActionCell postId={post.id} status={post.status} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* 一括操作バー */}
      <PostBulkActions
        selectedIds={selectedIds}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
```

**パターン解説**:

- `selectedIds: string[]` 状態で複数選択管理
- `allSelected` boolean derived state（全選択チェック）
- `toggleAll()` / `toggleOne(id)` ハンドラパターン
- Empty State: 0件時に EmptyState コンポーネント表示
- Responsive: `hidden md:table-cell` で非表示制御

---

### 1.2 PostTableHeader.tsx — ソート可能ヘッダー（完全コード）

```tsx
"use client";

import { useQueryStates } from "nuqs";
import { adminPostSearchParamsParsers } from "@/shared/lib/nuqs";
import { SortableColumnHeader } from "@/admin/components/table";
import { TableHeader, TableHead, TableRow } from "@/admin/components/ui";

type PostSortBy = "createdAt" | "publishedAt" | "title";

type PostTableHeaderProps = {
  allSelected: boolean;
  onToggleAll: () => void;
};

export function PostTableHeader({
  allSelected,
  onToggleAll,
}: PostTableHeaderProps) {
  const [params, setParams] = useQueryStates(adminPostSearchParamsParsers, {
    history: "push",
    shallow: false,
  });

  const handleSort = (column: PostSortBy) => {
    const isSameColumn = params.sortBy === column;
    void setParams({
      sortBy: column,
      sortOrder: isSameColumn && params.sortOrder === "desc" ? "asc" : "desc",
      page: 1,
    });
  };

  return (
    <TableHeader>
      <TableRow>
        <TableHead className="w-10">
          <input
            type="checkbox"
            checked={allSelected}
            onChange={onToggleAll}
            className="rounded border-border"
            aria-label="全選択"
          />
        </TableHead>
        <TableHead className="whitespace-nowrap">ステータス</TableHead>
        <SortableColumnHeader
          column="title"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
        >
          タイトル
        </SortableColumnHeader>
        <TableHead className="hidden md:table-cell">カテゴリ</TableHead>
        <TableHead className="hidden text-right lg:table-cell">PV</TableHead>
        <SortableColumnHeader
          column="publishedAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden md:table-cell"
        >
          公開日時
        </SortableColumnHeader>
        <SortableColumnHeader
          column="createdAt"
          currentSortBy={params.sortBy}
          currentSortOrder={params.sortOrder}
          onSort={handleSort}
          className="hidden lg:table-cell"
        >
          登録日
        </SortableColumnHeader>
        <TableHead>操作</TableHead>
      </TableRow>
    </TableHeader>
  );
}
```

**パターン解説**:

- `nuqs` パッケージで URL state 管理（filters, sort, pagination）
- `SortableColumnHeader` でカラムクリック時に toggle
  - 同じカラム: `asc` ↔ `desc`
  - 新しいカラム: `desc` から開始
- `page: 1` にリセット（新ソート時）

---

### 1.3 PostActionCell.tsx — アクション列（完全コード）

```tsx
"use client";

import { useOptimistic, useTransition } from "react";
import { toast } from "sonner";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { publishPost, unpublishPost } from "@/admin/actions/post/mutations";
import { PostStatus } from "@/shared/db/enums";
import { isMutationError } from "@/shared/lib/mutation-result";

type PostActionCellProps = {
  postId: string;
  status: PostStatus;
};

export function PostActionCell({ postId, status }: PostActionCellProps) {
  const [isPending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useOptimistic(status);
  const isPublished = optimisticStatus === PostStatus.PUBLISHED;

  const handlePublish = () => {
    startTransition(async () => {
      setOptimisticStatus(PostStatus.PUBLISHED);
      const result = await publishPost(postId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success(`公開しました（バージョン ${result.version}）`);
    });
  };

  const handleUnpublish = () => {
    startTransition(async () => {
      setOptimisticStatus(PostStatus.DRAFT);
      const result = await unpublishPost(postId);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("下書きに戻しました");
    });
  };

  return (
    <ActionDropdown disabled={isPending}>
      <ActionDropdownItem href={`/admin/posts/${postId}/edit`}>
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

**パターン解説**:

- `useOptimistic()` で即座ビジュアル更新（ネットワーク前）
- `useTransition()` で `isPending` フラグ管理
- Server Action 呼び出し → エラー/成功でトースト表示
- `<ActionDropdown>` 共通コンポーネント（ドロップダウンメニュー）

---

### 1.4 PostFilters.tsx — フィルターパネル（完全コード）

```tsx
"use client";

import { BaseFilters } from "@/admin/components/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/admin/components/ui";
import type { PostCategoryData } from "@/shared/domain/posts/types";
import { useFilterParamsWithCategory } from "@/admin/hooks";

type PostFiltersProps = {
  categories: PostCategoryData[];
};

export function PostFilters({ categories }: PostFiltersProps) {
  const { params, setCategory } = useFilterParamsWithCategory();

  return (
    <BaseFilters searchPlaceholder="タイトル、本文で検索...">
      {/* カテゴリフィルター */}
      <div className="w-full sm:w-48">
        <Select value={params.categoryId} onValueChange={setCategory}>
          <SelectTrigger>
            <SelectValue placeholder="カテゴリ" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ALL">すべてのカテゴリ</SelectItem>
            {categories.map((category) => (
              <SelectItem key={category.id} value={category.id}>
                {category.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </BaseFilters>
  );
}
```

**パターン解説**:

- `<BaseFilters>` ラッパー（検索バー + フィルター棚）
- `useFilterParamsWithCategory()` で URL state 管理
- `<Select>` コンポーネント（Headless UI 統合）
- ALL オプション + リソース一覧

---

### 1.5 ActionDropdown.tsx — ドロップダウンメニュー（完全コード）

```tsx
"use client";

import Link from "next/link";
import { IconDots } from "@tabler/icons-react";
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui";

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

/**
 * 管理画面テーブル行の操作メニュー共通コンポーネント
 */
export function ActionDropdown({ children, disabled }: ActionDropdownProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" disabled={disabled}>
          <IconDots className="h-4 w-4" />
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
```

**パターン解説**:

- `<ActionDropdown>` : 3点メニューボタン + ドロップダウン
- `<ActionDropdownItem href={...}>` : Link ベース
- `<ActionDropdownItem onClick={...}>` : onClick ベース
- `destructive` prop で赤色表示

---

## 2. 詳細ページ層コンポーネント

### 2.1 AdminDetailLayout.tsx — Server Component（完全コード）

```tsx
// Server Component — 'use client' なし
import { IconArrowLeft } from "@tabler/icons-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { Button } from "@/admin/components/ui/button";

type AdminDetailLayoutProps = {
  backHref: string;
  backLabel?: string;
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
};

export function AdminDetailLayout({
  backHref,
  backLabel = "一覧に戻る",
  title,
  subtitle,
  actions,
  children,
}: AdminDetailLayoutProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex flex-col gap-1">
        <Button variant="ghost" size="sm" className="-ml-2 w-fit" asChild>
          <Link href={backHref}>
            <IconArrowLeft className="mr-2 h-4 w-4" />
            {backLabel}
          </Link>
        </Button>
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-foreground">
              {title}
            </h1>
            {subtitle && <p className="text-muted-foreground">{subtitle}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      </div>
      {/* コンテンツ */}
      {children}
    </div>
  );
}
```

**パターン解説**:

- Server Component（`'use client'` なし）
- `<IconArrowLeft>` 付き戻るリンク
- タイトル + サブタイトル
- 右側に `actions` スロット（削除・公開ボタン等を配置）
- `children` に詳細セクション群

---

### 2.2 DetailSection.tsx — 詳細セクションカード（完全コード）

```tsx
import type { ReactNode } from "react";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/admin/components/ui/card";

type DetailSectionProps = {
  title: string;
  description?: string;
  children: ReactNode;
};

export function DetailSection({
  title,
  description,
  children,
}: DetailSectionProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base font-semibold">{title}</CardTitle>
        {description && <CardDescription>{description}</CardDescription>}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}
```

**パターン解説**:

- `<Card>` ラッパー
- `<CardHeader>` に title + description
- `<CardContent>` に children（フォーム等）

---

### 2.3 DetailDeleteButton.tsx — 削除ボタン（完全コード）

```tsx
"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { IconTrash } from "@tabler/icons-react";
import { toast } from "sonner";
import { Button } from "@/admin/components/ui/button";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import {
  isMutationError,
  type MutationResult,
} from "@/shared/lib/mutation-result";

type DetailDeleteButtonProps = {
  itemName?: string;
  onDelete: () => Promise<MutationResult<unknown>>;
  redirectTo: string;
  successMessage?: string;
};

export function DetailDeleteButton({
  itemName,
  onDelete,
  redirectTo,
  successMessage,
}: DetailDeleteButtonProps) {
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();

  const handleConfirm = () => {
    startTransition(async () => {
      const result = await onDelete();
      if (!isMutationError(result)) {
        if (successMessage) toast.success(successMessage);
        router.push(redirectTo);
      } else {
        setOpen(false);
        toast.error(result.error);
      }
    });
  };

  return (
    <>
      <Button
        variant="destructive"
        size="sm"
        onClick={() => setOpen(true)}
        disabled={isPending}
      >
        <IconTrash className="mr-2 h-4 w-4" />
        削除
      </Button>
      <DeleteConfirmDialog
        open={open}
        onOpenChange={setOpen}
        {...(itemName !== undefined && { itemName })}
        onConfirm={handleConfirm}
        isPending={isPending}
      />
    </>
  );
}
```

**パターン解説**:

- `<DeleteConfirmDialog>` 確認ダイアログ
- `useTransition()` で削除中の UI ロック
- 削除成功時 `router.push(redirectTo)`
- `isPending` フラグでボタン disable

---

## 3. Server Actions 実装パターン

### 3.1 inquiry.ts — 完全な Server Action 実装（エッセンス）

```tsx
"use server";

import { updateTag } from "next/cache";
import { z } from "zod";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import {
  updateInquiryStatus as updateInquiryStatusCommand,
  deleteInquiry as deleteInquiryCommand,
  replyToInquiryCommand,
  updateInquiryCustomer as updateInquiryCustomerCommand,
} from "@/shared/domain/inquiries/commands";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { fireAndForget } from "@/shared/lib/async-utils";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import { sendInquiryReplyEmail } from "@/shared/lib/email/inquiry-emails";
import { ErrorCategory } from "@/shared/lib/errors/server";
import { InquiryStatus } from "@/shared/db/enums";
import type { MutationResult } from "@/shared/lib/mutation-result";

// ============================================
// 1. Zod スキーマ定義
// ============================================

const updateStatusSchema = z.object({
  id: z.string().uuid({ error: "お問い合わせIDが不正です" }),
  status: z.enum(InquiryStatus),
});

const idSchema = z.string().uuid({ error: "お問い合わせIDが不正です" });

// ============================================
// 2. Server Action 定義
// ============================================

export async function updateInquiryStatus(
  id: string,
  status: InquiryStatus,
): Promise<MutationResult> {
  // ① Zod パース
  const parsed = updateStatusSchema.safeParse({ id, status });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // ② executeAdminMutationResult で wrap（認証・権限・監査ログ一括）
  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.id,

    // ③ ドメインコマンド実行
    execute: async () => {
      await updateInquiryStatusCommand(parsed.data.id, parsed.data.status);
      return null;
    },

    // ④ キャッシュ無効化
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));
    },
  });
}

export async function deleteInquiry(id: string): Promise<MutationResult> {
  const validated = idSchema.safeParse(id);
  if (!validated.success) {
    return createValidationMutationError(validated.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "delete",
    resourceId: validated.data,
    execute: async () => {
      await deleteInquiryCommand(validated.data);
      return null;
    },
    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
    },
  });
}

// ============================================
// 3. 複雑な操作（返り値あり、メール送信等）
// ============================================

const replySchema = z.object({
  id: z.string().uuid({ error: "お問い合わせIDが不正です" }),
  replyMessage: z.string().min(1, { error: "回答内容を入力してください" }),
});

export async function replyToInquiry(
  inquiryId: string,
  replyMessage: string,
): Promise<MutationResult<{ id: string }>> {
  const parsed = replySchema.safeParse({ id: inquiryId, replyMessage });
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "inquiry",
    action: "update",
    resourceId: parsed.data.id,

    execute: async (user) => {
      // ドメインコマンド実行
      const result = await replyToInquiryCommand(
        parsed.data.id,
        parsed.data.replyMessage,
        user.id,
      );

      // メール送信（fire-and-forget）
      const { emailContext } = result;
      fireAndForget(
        sendInquiryReplyEmail({
          inquiryId: parsed.data.id,
          customerName: emailContext.name,
          customerEmail: emailContext.email,
          originalSubject: emailContext.subject,
          originalMessage: emailContext.message,
          replyMessage: parsed.data.replyMessage,
          repliedByName: user.name ?? "スタッフ",
        }),
        {
          operation: "sendInquiryReplyEmail",
          category: ErrorCategory.EXTERNAL_API,
        },
      );

      return { id: result.id };
    },

    afterSuccess: () => {
      updateTag(CACHE_TAGS.INQUIRIES);
      updateTag(getCacheTag.inquiries.detail(parsed.data.id));
    },

    // 監査ログ用の ID 抽出
    resolveAuditResourceId: (data) => data.id,
  });
}
```

**パターン解説**:

1. **Zod スキーマ** : リソースごとにスキーマ定義
2. **safeParse()** : エラーハンドリング
3. **executeAdminMutationResult()** : 認証・権限・監査ログ一括
4. **ドメインコマンド実行** : `execute` callback
5. **キャッシュ無効化** : `afterSuccess` callback で `updateTag()`
6. **戻り値** : `MutationResult<T>` または `MutationResult`（no data）

---

### 3.2 page-section.ts — セクション CRUD（完全コード）

```tsx
"use server";

import { updateTag } from "next/cache";
import { executeAdminMutationResult } from "@/admin/lib/admin-action";
import { renderEditorStateToHtmlLazy } from "@/admin/lib/lazy-renderer";
import { createValidationMutationError } from "@/shared/lib/action-helpers";
import { CACHE_TAGS, getCacheTag } from "@/shared/lib/constants";
import type { MutationResult } from "@/shared/lib/mutation-result";
import {
  createPageSectionCommand,
  deletePageSectionCommand,
  duplicatePageSectionCommand,
  togglePageSectionCommand,
  updatePageSectionCommand,
  updatePageSectionOrderCommand,
} from "@/shared/domain/sections/commands";
import {
  createSectionSchema,
  updateSectionSchema,
  updateSectionOrderSchema,
  type CreateSectionInput,
  type UpdateSectionInput,
  type UpdateSectionOrderInput,
  type SectionConfig,
} from "@/shared/lib/validations/section";

export type PageSectionData = {
  id: string;
  pageId: string;
  type: string;
  title: string | null;
  config: SectionConfig;
  design: unknown;
  contentHtml: string | null;
  contentJson: unknown;
  order: number;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type PageWithSections = {
  id: string;
  slug: string;
  title: string;
  sections: PageSectionData[];
};

// ============================================
// キャッシュ無効化ヘルパー
// ============================================

function revalidatePages(pageId?: string) {
  updateTag(CACHE_TAGS.SECTIONS);
  updateTag(CACHE_TAGS.PAGE_SECTIONS);
  updateTag(CACHE_TAGS.PAGES);
  if (pageId) {
    updateTag(getCacheTag.pages.detail(pageId));
  }
}

// ============================================
// Server Actions
// ============================================

export async function createPageSection(
  input: CreateSectionInput,
): Promise<
  MutationResult<Awaited<ReturnType<typeof createPageSectionCommand>>>
> {
  const parsed = createSectionSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  // Lexical JSON → HTML レンダリング
  const contentHtml = parsed.data.contentJson
    ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
    : null;

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    ...(parsed.data.pageId != null && { resourceId: parsed.data.pageId }),

    execute: async () => createPageSectionCommand(parsed.data, contentHtml),

    afterSuccess: () => {
      if (parsed.data.pageId) {
        revalidatePages(parsed.data.pageId);
      }
    },

    resolveAuditResourceId: (result) => result.id,
  });
}

export async function updatePageSection(
  id: string,
  input: UpdateSectionInput,
): Promise<MutationResult> {
  const parsed = updateSectionSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  const contentHtml =
    parsed.data.contentJson === undefined
      ? undefined
      : parsed.data.contentJson
        ? await renderEditorStateToHtmlLazy(parsed.data.contentJson)
        : null;

  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,

    execute: async () => {
      const result = await updatePageSectionCommand(
        id,
        parsed.data,
        contentHtml,
      );
      pageId = result.pageId;
      return null;
    },

    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function togglePageSection(
  id: string,
  isActive: boolean,
): Promise<MutationResult> {
  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,

    execute: async () => {
      const result = await togglePageSectionCommand(id, isActive);
      pageId = result.pageId;
      return null;
    },

    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function updatePageSectionOrder(
  pageId: string,
  input: UpdateSectionOrderInput,
): Promise<MutationResult> {
  const parsed = updateSectionOrderSchema.safeParse(input);
  if (!parsed.success) {
    return createValidationMutationError(parsed.error);
  }

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: pageId,

    execute: async () => {
      await updatePageSectionOrderCommand(pageId, parsed.data);
      return null;
    },

    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function deletePageSection(id: string): Promise<MutationResult> {
  let pageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,

    execute: async () => {
      const result = await deletePageSectionCommand(id);
      pageId = result.pageId;
      return null;
    },

    afterSuccess: () => {
      revalidatePages(pageId);
    },
  });
}

export async function duplicatePageSection(
  id: string,
): Promise<MutationResult<PageSectionData>> {
  let duplicatedPageId = "";

  return executeAdminMutationResult({
    resource: "page",
    action: "update",
    resourceId: id,

    execute: async () => {
      const result = await duplicatePageSectionCommand(id);
      duplicatedPageId = result.pageId ?? "";
      return result.section;
    },

    afterSuccess: () => {
      revalidatePages(duplicatedPageId);
    },

    resolveAuditResourceId: (result) => result.id,
  });
}
```

**パターン解説**:

- **Lexical JSON → HTML** : `renderEditorStateToHtmlLazy()`
- **`pageId` の遅延キャプチャ** : execute で設定 → afterSuccess で使用
- **複数キャッシュ無効化** : `revalidatePages()` helper
- **Zod バリデーション** → `createValidationMutationError()`

---

## 4. ドメイン層実装パターン

### 4.1 posts/commands.ts — エッセンス（250行超）

```tsx
import "server-only";

import { PostStatus } from "@/shared/db/enums";
import { parsePrismaInputJson } from "@/shared/db/json";
import { prisma } from "@/shared/db/prisma";
import { DomainError } from "@/shared/domain/domain-error";
import { omitUndefined } from "@/shared/lib/serialize";
import {
  checkSlugAvailability,
  getSlugErrorMessage,
} from "@/shared/lib/slug-validation";
import type {
  CreatePostBackupResult,
  CreatePostCategoryResult,
  CreatePostCommandInput,
  CreatePostResult,
  CreatePostTagResult,
  DeletePostResult,
  PostCategoryMutationInput,
  PostTagMutationInput,
  PublishPostResult,
  RestorePostVersionResult,
  UpdatePostCommandInput,
  UpdatePostResult,
} from "@/shared/domain/posts/types";

// ============================================
// 前提条件チェック関数
// ============================================

async function ensurePostExists(
  id: string,
): Promise<{ id: string; slug: string }> {
  const post = await prisma.post.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  return post;
}

async function ensurePostSlugAvailable(
  slug: string,
  currentId?: string,
): Promise<void> {
  const slugCheck = await checkSlugAvailability(slug, {
    currentType: "post",
    currentId,
  });

  if (!slugCheck.available) {
    throw new DomainError(getSlugErrorMessage(slugCheck.reason), "CONFLICT");
  }
}

async function ensurePostCategoryExists(id: string): Promise<void> {
  const category = await prisma.postCategory.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!category) {
    throw new DomainError("カテゴリが見つかりません", "NOT_FOUND");
  }
}

async function ensurePostTagsExist(tagIds: string[]): Promise<void> {
  if (tagIds.length === 0) {
    return;
  }

  const count = await prisma.postTag.count({
    where: {
      id: {
        in: tagIds,
      },
    },
  });

  if (count !== tagIds.length) {
    throw new DomainError("タグが見つかりません", "NOT_FOUND");
  }
}

// ============================================
// CRUD コマンド
// ============================================

export async function createPost(
  input: CreatePostCommandInput,
): Promise<CreatePostResult> {
  // 前提条件チェック（並行実行）
  await Promise.all([
    ensurePostSlugAvailable(input.slug),
    ensurePostCategoryExists(input.categoryId),
    ensurePostTagsExist(input.tags),
  ]);

  // DB 作成
  const post = await prisma.post.create({
    data: {
      ...omitUndefined(buildPostData(input)),
      status: PostStatus.DRAFT,
      authorId: input.authorId,
      postTags: {
        create: input.tags.map((tagId) => ({ tagId })),
      },
    },
    select: {
      id: true,
      slug: true,
    },
  });

  return post;
}

export async function updatePost(
  id: string,
  input: UpdatePostCommandInput,
): Promise<UpdatePostResult> {
  const existingPost = await ensurePostExists(id);

  await Promise.all([
    ensurePostSlugAvailable(input.slug, id),
    ensurePostCategoryExists(input.categoryId),
    ensurePostTagsExist(input.tags),
  ]);

  await prisma.post.update({
    where: { id },
    data: {
      ...omitUndefined(buildPostData(input)),
      contentWidth: input.contentWidth,
      contentWidthCustom: input.contentWidthCustom,
      postTags: {
        deleteMany: {},
        create: input.tags.map((tagId) => ({ tagId })),
      },
    },
  });

  return {
    oldSlug: existingPost.slug,
    slug: input.slug,
  };
}

export async function deletePost(id: string): Promise<DeletePostResult> {
  const post = await ensurePostExists(id);

  await prisma.post.delete({
    where: { id },
  });

  return {
    slug: post.slug,
  };
}

export async function publishPost(
  id: string,
  userId: string,
): Promise<PublishPostResult> {
  const [post, latestVersion] = await Promise.all([
    prisma.post.findUnique({
      where: { id },
      select: {
        id: true,
        slug: true,
        publishedAt: true,
        contentHtml: true,
        contentJson: true,
      },
    }),
    prisma.postVersion.findFirst({
      where: { postId: id },
      orderBy: { version: "desc" },
      select: { version: true },
    }),
  ]);

  if (!post) {
    throw new DomainError("投稿記事が見つかりません", "NOT_FOUND");
  }

  const version = (latestVersion?.version ?? 0) + 1;

  await prisma.$transaction([
    prisma.post.update({
      where: { id },
      data: {
        status: PostStatus.PUBLISHED,
        publishedAt: post.publishedAt ?? new Date(),
      },
    }),
    prisma.postVersion.create({
      data: omitUndefined({
        postId: id,
        version,
        contentHtml: post.contentHtml,
        contentJson: post.contentJson ?? undefined,
        createdBy: userId,
      }),
    }),
  ]);

  return {
    slug: post.slug,
    version,
  };
}

// ... ほかの CRUD 操作と同様
```

**パターン解説**:

1. **前提条件チェック** : `ensureXxxExists()` 関数
2. **並行実行** : `Promise.all()` で複数チェック同時実行
3. **Prisma `$transaction`** : 複数操作の一括実行
4. **DomainError** : "NOT_FOUND"/"CONFLICT" など標準化
5. **戻り値** : 必要最小限（ID, slug など）

---

### 4.2 posts/admin-queries.ts — クエリー層（エッセンス）

```tsx
import "server-only";

import { PostStatus } from "@/shared/db/enums";
import { prisma } from "@/shared/db/prisma";
import type { PostWhereInput } from "@/shared/types/prisma";
import type {
  GetPostsResult,
  PostCategoryData,
  PostData,
  PostFilters,
  PostPagination,
  PostTagData,
  PostVersionData,
} from "@/shared/domain/posts/types";

// ============================================
// WHERE 構築ヘルパー
// ============================================

function buildPostWhere(filters: PostFilters): PostWhereInput {
  const where: PostWhereInput = {};

  if (filters.status === "PUBLISHED") {
    where.status = PostStatus.PUBLISHED;
  } else if (filters.status === "DRAFT") {
    where.status = PostStatus.DRAFT;
  }

  if (filters.categoryId) {
    where.categoryId = filters.categoryId;
  }

  if (filters.search) {
    where.OR = [
      { title: { contains: filters.search, mode: "insensitive" } },
      { excerpt: { contains: filters.search, mode: "insensitive" } },
      { contentHtml: { contains: filters.search, mode: "insensitive" } },
    ];
  }

  return where;
}

// ============================================
// 管理画面クエリー
// ============================================

export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {},
): Promise<GetPostsResult> {
  const {
    page = 1,
    limit = 10,
    sortBy = "createdAt",
    sortOrder = "desc",
  } = pagination;
  const where = buildPostWhere(filters);

  // count + findMany を並行実行
  const [total, posts] = await prisma.$transaction([
    prisma.post.count({ where }),
    prisma.post.findMany({
      where,
      select: {
        id: true,
        title: true,
        slug: true,
        excerpt: true,
        thumbnailUrl: true,
        ogpImageUrl: true,
        categoryId: true,
        metaDescription: true,
        metaKeywords: true,
        ogpTitle: true,
        ogpDescription: true,
        publishedAt: true,
        status: true,
        viewCount: true,
        createdAt: true,
        updatedAt: true,
        contentWidth: true,
        contentWidthCustom: true,
        category: {
          select: { id: true, name: true, slug: true },
        },
        author: {
          select: { id: true, name: true, email: true },
        },
        postTags: {
          select: {
            tag: { select: { id: true, name: true, slug: true } },
          },
        },
      },
      orderBy: {
        [sortBy]: sortOrder,
      },
      skip: (page - 1) * limit,
      take: limit,
    }),
  ]);

  return {
    posts: posts.map((post) => ({
      ...post,
      postTags: post.postTags.map((postTag) => postTag.tag),
      publishedAt: post.publishedAt?.toISOString() ?? null,
      createdAt: post.createdAt.toISOString(),
      updatedAt: post.updatedAt.toISOString(),
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  };
}

export async function getPostById(id: string): Promise<PostData | null> {
  const post = await prisma.post.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
      postTags: {
        include: {
          tag: {
            select: { id: true, name: true, slug: true },
          },
        },
      },
    },
  });

  if (!post) {
    return null;
  }

  return {
    ...post,
    postTags: post.postTags.map((postTag) => postTag.tag),
    publishedAt: post.publishedAt?.toISOString() ?? null,
    createdAt: post.createdAt.toISOString(),
    updatedAt: post.updatedAt.toISOString(),
  };
}

// ... 他のクエリーと同様
```

**パターン解説**:

- **WHERE 構築** : `buildPostWhere()` で filter object → Prisma WHERE
- **並行実行** : `$transaction([count, findMany])` で同時実行
- **Serialization** : Date → ISO string 変換
- **Lazy relations** : Nested select で必要フィールドのみ取得

---

## 5. バリデーションスキーマ パターン

### 5.1 section.ts — 大規模スキーマ（4,000+ 行エッセンス）

```tsx
/**
 * 統一セクション バリデーションスキーマ
 */

import { z } from "zod";

// ============================================
// SectionType 定義
// ============================================

export const SectionType = {
  HERO: "hero",
  HERO_PARALLAX: "hero-parallax",
  CUSTOM: "custom",
  CONCEPT: "concept",
  SPACE_LIST: "space-list",
  SPACE_SHOWCASE: "space-showcase",
  NEWS_LIST: "news-list",
  POST_LIST: "post-list",
  FAQ_LIST: "faq-list",
  FEATURES: "features",
  TESTIMONIAL: "testimonial",
  GALLERY: "gallery",
  CTA: "cta",
  CONTACT_FORM: "contact-form",
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
} as const;

export type SectionType = (typeof SectionType)[keyof typeof SectionType];

// ============================================
// 共通スキーマ
// ============================================

const maxWidthSchema = z.enum(["sm", "md", "lg", "xl", "full"]).default("lg");

// ============================================
// セクションタイプ別 config スキーマ
// ============================================

/** Hero セクション設定（入力） */
const heroConfigRawSchema = z.object({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  subtitle: z.string().max(300).optional(),
  backgroundImageUrl: z.string().url().optional().or(z.literal("")),
  buttons: z.array(ctaButtonItemSchema).optional(),
  ctaPrimary: ctaButtonSchema.optional(),
  ctaSecondary: optionalCtaButtonSchema,
  height: z.enum(["sm", "md", "lg", "xl"]).default("md"),
  overlay: z.boolean().default(true),
  overlayOpacity: z.number().min(0).max(100).default(40),
  variant: z.enum(["default", "overlay"]).default("default"),
  videoUrl: z.string().url().optional().or(z.literal("")),
  parallaxSpeed: z.number().min(0).max(1).default(0.5),
});

/** Hero セクション設定（出力: レガシーCTA → buttons[] 統一） */
export const heroConfigSchema = heroConfigRawSchema.transform(
  ({ ctaPrimary, ctaSecondary, buttons, ...rest }) => ({
    ...rest,
    buttons:
      buttons && buttons.length > 0
        ? buttons
        : transformLegacyCtaToButtons(ctaPrimary, ctaSecondary),
  }),
);

/** SpaceList セクション設定 */
export const spaceListConfigSchema = z.object({
  sectionLabel: z.string().max(50).default("Spaces"),
  title: z.string().max(100).default("スペース一覧"),
  maxItems: z.number().int().min(1).max(24).default(6),
  showOnlyPublished: z.boolean().default(true),
  showViewAllLink: z.boolean().default(true),
  viewAllText: z.string().max(50).default("全てのスペースを見る"),
  viewAllUrl: z.string().max(200).default("/spaces"),
  layout: z.enum(["grid", "list"]).default("grid"),
  columns: z.number().int().min(1).max(4).default(3),
  cardStyle: z.enum(["default", "bordered"]).default("bordered"),
  imageAspect: z.enum(["16:9", "4:3", "1:1"]).default("4:3"),
});

// ... 他の 15 種類も同様

// ============================================
// Dynamic validation（レジストリ委譲）
// ============================================

export function validateSectionConfig(
  type: string,
  config: unknown,
):
  | { success: true; data: SectionConfig }
  | { success: false; error: z.ZodError } {
  const def = getSectionDefinition(type);
  if (!def) {
    return { success: false, error: new z.ZodError([]) };
  }
  const result = def.configSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as SectionConfig };
  }
  return { success: false, error: result.error };
}

// ============================================
// 型エクスポート
// ============================================

export type HeroConfig = z.output<typeof heroConfigSchema>;
export type SpaceListConfig = z.output<typeof spaceListConfigSchema>;
// ... 他の 15 種類も同様

export type SectionConfig =
  | HeroConfig
  | HeroParallaxConfig
  | CustomConfig
  // ... 他の 14 種類
  | InstagramConfig;

// ============================================
// 型ガード関数
// ============================================

function createConfigGuard<T>(schema: z.ZodType<T>) {
  return (config: unknown): config is T => schema.safeParse(config).success;
}

export const isHeroConfig = createConfigGuard(heroConfigSchema);
export const isSpaceListConfig = createConfigGuard(spaceListConfigSchema);
// ... 他の 15 種類も同様
```

**パターン解説**:

- **SectionType union** : 17 種類の type 定数
- **type 別 config schema** : 各セクション固有の Zod schema
- **transform()** : レガシーデータ形式の統一（CTA button）
- **validateSectionConfig()** : dynamic validation（registry.ts 連携）
- **型ガード** : `isHeroConfig()` などでランタイム型チェック

---

### 5.2 coupon.ts — 小規模スキーマ例

```tsx
/**
 * クーポン関連のバリデーションスキーマ
 */

import { z } from "zod";
import { CouponType } from "@/shared/db/enums";

// ============================================
// Base Schemas
// ============================================

export const couponCodeSchema = z
  .string()
  .min(4, { error: "クーポンコードは4文字以上で入力してください" })
  .max(20, { error: "クーポンコードは20文字以内で入力してください" })
  .regex(/^[A-Z0-9]+$/, {
    error: "クーポンコードは大文字英数字のみ使用できます",
  })
  .transform((val) => val.toUpperCase());

export const couponTypeSchema = z.enum(CouponType);

export const discountValueSchema = z.coerce
  .number()
  .positive({ error: "割引値は0より大きい必要があります" });

// ============================================
// Coupon Form Schema (Admin)
// ============================================

export const couponFormSchema = z
  .object({
    code: couponCodeSchema,
    name: z
      .string()
      .min(1, { error: "名称を入力してください" })
      .max(100, { error: "名称は100文字以内で入力してください" }),
    description: z
      .string()
      .max(500, { error: "説明は500文字以内で入力してください" })
      .optional()
      .or(z.literal("")),
    type: couponTypeSchema,
    discountValue: discountValueSchema,
    minReservationAmount: z.coerce.number().nonnegative().optional().nullable(),
    maxDiscountAmount: z.coerce.number().positive().optional().nullable(),
    validFrom: z.coerce.date({ error: "有効開始日を入力してください" }),
    validUntil: z.coerce.date().optional().nullable(),
    usageLimit: z.coerce.number().int().positive().optional().nullable(),
    isActive: z.boolean().default(true),
    canCombineWithDurationDiscount: z.boolean().default(true),
  })
  .refine(
    (data) => {
      // パーセント割引の場合、100%を超えないこと
      if (data.type === "PERCENTAGE" && data.discountValue > 100) {
        return false;
      }
      return true;
    },
    {
      error: "パーセント割引は100%以下で入力してください",
      path: ["discountValue"],
    },
  )
  .refine(
    (data) => {
      // 有効期限が開始日より後であること
      if (data.validUntil && data.validFrom > data.validUntil) {
        return false;
      }
      return true;
    },
    {
      error: "有効期限は開始日より後に設定してください",
      path: ["validUntil"],
    },
  );

export type CouponFormInput = z.input<typeof couponFormSchema>;
export type CouponFormOutput = z.output<typeof couponFormSchema>;
```

**パターン解説**:

- **transform()** : 大文字化（自動正規化）
- **coerce** : 文字列 → number 自動変換
- **.refine()** : クロスフィールド検証
  - 単一フィールド: `path: ["fieldName"]`
  - 複数フィールド: `path` 指定なし（全体エラー）

---

## 6. 公開セクション層（SectionRenderer）

### 6.1 SectionRenderer.tsx — 完全コード

```tsx
/**
 * SectionRenderer — DB Section → v3 コンポーネント出し分け
 */

import type { ReactElement } from "react";
import { SectionType } from "@/shared/lib/validations/section";
import { parseSectionDesign } from "@/shared/lib/validations/section";
import {
  getHeroConfig,
  getHeroParallaxConfig,
  getCustomConfig,
  getConceptConfig,
  getSpaceListConfig,
  getSpaceShowcaseConfig,
  getNewsListConfig,
  getPostListConfig,
  getFaqListConfig,
  getFeaturesConfig,
  getTestimonialConfig,
  getGalleryConfig,
  getCtaConfig,
  getContactFormConfig,
  getMapConfig,
  getEmbedConfig,
  getInstagramConfig,
} from "@/shared/lib/validations/section-defaults";
import {
  getPublishedFaqItems,
  getShowcaseSpaces,
  type PublicSection,
} from "@/shared/domain/sections/queries";
import { getPublishedNews } from "@/shared/domain/news/queries";
import { getPublishedPosts } from "@/shared/domain/posts/queries";

// v3 components
import { HeroSection } from "../../../_components/HeroSection";
import { StandardHeroSection } from "../../../_components/StandardHeroSection";
import { ConceptSection } from "../../../_components/ConceptSection";
// ... 他 14 個のコンポーネント import

interface SectionRendererProps {
  readonly section: PublicSection;
}

export async function SectionRenderer({
  section,
}: SectionRendererProps): Promise<ReactElement | null> {
  const design = parseSectionDesign(section.design);

  switch (section.type) {
    // =========================================================================
    // Hero variants
    // =========================================================================

    case SectionType.HERO: {
      const config = getHeroConfig(section.config);
      return <StandardHeroSection config={config} design={design} />;
    }

    case SectionType.HERO_PARALLAX: {
      const config = getHeroParallaxConfig(section.config);
      return <HeroSection config={config} design={design} />;
    }

    // =========================================================================
    // Content
    // =========================================================================

    case SectionType.CUSTOM: {
      const config = getCustomConfig(section.config);
      return (
        <CustomSection
          config={config}
          content={section.contentHtml ?? ""}
          title={section.title}
          design={design}
        />
      );
    }

    case SectionType.CONCEPT: {
      const config = getConceptConfig(section.config);
      return <ConceptSection config={config} design={design} />;
    }

    // =========================================================================
    // Lists (DB-dependent)
    // =========================================================================

    case SectionType.SPACE_LIST: {
      const config = getSpaceListConfig(section.config);
      const rawSpaces = await getShowcaseSpaces(
        config.maxItems,
        config.showOnlyPublished,
      );
      const spaces = rawSpaces.map((s) => ({
        id: s.id,
        slug: s.slug,
        name: s.name,
        description: s.description,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        mainImageUrl: s.mainImageUrl,
      }));
      return (
        <SpaceListSection config={config} spaces={spaces} design={design} />
      );
    }

    case SectionType.SPACE_SHOWCASE: {
      const config = getSpaceShowcaseConfig(section.config);
      const rawSpaces = await getShowcaseSpaces(
        config.maxItems,
        config.showOnlyPublished,
      );
      const spaces = rawSpaces.map((s) => ({
        id: s.id,
        name: s.name,
        nameJa: s.name,
        tagline: s.description,
        capacity: s.capacity,
        hourlyPrice: s.hourlyPrice,
        area: s.area,
        imageUrl: s.mainImageUrl,
        imageAlt: s.name,
        slug: s.slug,
      }));
      return <SpaceShowcase config={config} spaces={spaces} design={design} />;
    }

    case SectionType.NEWS_LIST: {
      const config = getNewsListConfig(section.config);
      const rawNews = await getPublishedNews(config.maxItems);
      const news = rawNews.map((n) => ({
        id: n.id,
        slug: n.slug,
        url: n.url,
        title: n.title,
        publishedAt: n.publishedAt,
      }));
      return <NewsListSection config={config} news={news} design={design} />;
    }

    case SectionType.POST_LIST: {
      const config = getPostListConfig(section.config);
      const rawPosts = await getPublishedPosts(
        config.maxItems,
        config.categoryId,
      );
      const posts = rawPosts.map((p) => ({
        id: p.id,
        slug: p.slug,
        url: p.url,
        title: p.title,
        excerpt: p.excerpt,
        thumbnailUrl: p.thumbnailUrl,
        publishedAt: p.publishedAt,
        categoryName: p.category?.name ?? null,
      }));
      return <PostListSection config={config} posts={posts} design={design} />;
    }

    case SectionType.FAQ_LIST: {
      const config = getFaqListConfig(section.config);
      const inlineItems = config.items;
      const hasInlineItems = inlineItems != null && inlineItems.length > 0;
      const items = hasInlineItems
        ? inlineItems.map((item, index) => ({
            id: `inline-${index}`,
            question: item.question,
            answer: item.answer,
          }))
        : (await getPublishedFaqItems(config.maxItems, config.categoryId)).map(
            (f) => ({
              id: f.id,
              question: f.question,
              answer: f.answerHtml ?? "",
            }),
          );
      return <FaqListSection config={config} items={items} design={design} />;
    }

    // =========================================================================
    // Features & Social proof
    // =========================================================================

    case SectionType.FEATURES: {
      const config = getFeaturesConfig(section.config);
      return <FeaturesSection config={config} design={design} />;
    }

    case SectionType.TESTIMONIAL: {
      const config = getTestimonialConfig(section.config);
      return <TestimonialSection config={config} design={design} />;
    }

    case SectionType.GALLERY: {
      const config = getGalleryConfig(section.config);
      return <GallerySection config={config} design={design} />;
    }

    // =========================================================================
    // Functional
    // =========================================================================

    case SectionType.CTA: {
      const config = getCtaConfig(section.config);
      return <CTASection config={config} design={design} />;
    }

    case SectionType.CONTACT_FORM: {
      const config = getContactFormConfig(section.config);
      return <ContactFormSection config={config} design={design} />;
    }

    case SectionType.MAP: {
      const config = getMapConfig(section.config);
      return <MapSection config={config} design={design} />;
    }

    case SectionType.EMBED: {
      const config = getEmbedConfig(section.config);
      return <EmbedSection config={config} design={design} />;
    }

    case SectionType.INSTAGRAM: {
      const config = getInstagramConfig(section.config);
      return <InstagramSection config={config} design={design} />;
    }

    default:
      return null;
  }
}
```

**パターン解説**:

- **Switch 式** : type → コンポーネント出し分け
- **config parse** : `getXxxConfig()` で safe parse
- **DB クエリー** : `getShowcaseSpaces()` などで DB データ取得
- **Data transform** : DB structure → component props
- **Dual source** : FAQ の inline items vs DB（config.items があればそれ使用）

---

### 6.2 SectionWrapper.tsx — design 共通フィールドラッパー

```tsx
/**
 * SectionWrapper — design JSON の共通フィールドを適用するセクションラッパー
 */

import type { ReactElement, ReactNode } from "react";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

// =============================================================================
// Mapping tables
// =============================================================================

const paddingTopMap = {
  none: "",
  sm: "pt-8 md:pt-12",
  md: "pt-16 md:pt-24",
  lg: "pt-24 md:pt-32 lg:pt-40",
  xl: "pt-32 md:pt-40 lg:pt-48",
} satisfies Record<NonNullable<SectionDesign["paddingTop"]>, string>;

const paddingBottomMap = {
  none: "",
  sm: "pb-8 md:pb-12",
  md: "pb-16 md:pb-24",
  lg: "pb-24 md:pb-32 lg:pb-40",
  xl: "pb-32 md:pb-40 lg:pb-48",
} satisfies Record<NonNullable<SectionDesign["paddingBottom"]>, string>;

const backgroundMap = {
  default: "",
  surface: "bg-surface",
  accent: "bg-accent",
  primary: "bg-primary text-primary-foreground",
  dark: "bg-foreground text-background",
  image: "bg-cover bg-center bg-no-repeat",
  gradient: "bg-gradient-to-b from-surface to-background",
} satisfies Record<NonNullable<SectionDesign["background"]>, string>;

const maxWidthMap = {
  sm: "max-w-3xl",
  md: "max-w-4xl",
  lg: "max-w-6xl",
  xl: "max-w-7xl",
  full: "max-w-full",
} satisfies Record<NonNullable<SectionDesign["maxWidth"]>, string>;

const textAlignMap = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
} satisfies Record<NonNullable<SectionDesign["textAlign"]>, string>;

// =============================================================================
// Component
// =============================================================================

interface SectionWrapperProps {
  readonly design: SectionDesign;
  readonly children: ReactNode;
  readonly className?: string;
  readonly style?: React.CSSProperties;
  readonly skipPadding?: boolean;
  readonly skipContainer?: boolean;
}

export function SectionWrapper({
  design,
  children,
  className,
  style: styleProp,
  skipPadding,
  skipContainer,
}: SectionWrapperProps): ReactElement {
  const paddingClass = skipPadding
    ? ""
    : `${paddingTopMap[design.paddingTop]} ${paddingBottomMap[design.paddingBottom]}`;
  const bgClass = backgroundMap[design.background];
  const maxWidthClass = maxWidthMap[design.maxWidth];
  const alignClass =
    design.textAlign !== "left" ? textAlignMap[design.textAlign] : "";

  const hasBgImage = design.background === "image" && design.backgroundImageUrl;
  const bgImageStyle = hasBgImage
    ? { backgroundImage: `url(${design.backgroundImageUrl})` }
    : undefined;
  const mergedStyle =
    bgImageStyle || styleProp ? { ...bgImageStyle, ...styleProp } : undefined;

  const showOverlay = hasBgImage && design.backgroundOverlayOpacity > 0;

  return (
    <section
      className={[
        "relative",
        paddingClass,
        bgClass,
        alignClass,
        design.customClass,
        className,
      ]
        .filter(Boolean)
        .join(" ")}
      style={mergedStyle}
    >
      {showOverlay && (
        <div
          className="pointer-events-none absolute inset-0 bg-foreground"
          style={{ opacity: design.backgroundOverlayOpacity / 100 }}
        />
      )}
      {skipContainer ? (
        children
      ) : (
        <div className={`mx-auto px-5 md:px-8 ${maxWidthClass}`}>
          {children}
        </div>
      )}
    </section>
  );
}

// =============================================================================
// Text style helpers (for use within section components)
// =============================================================================

export const titleSizeMap = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-2xl md:text-3xl lg:text-4xl",
  xl: "text-3xl md:text-4xl lg:text-5xl",
  "2xl": "text-4xl md:text-5xl lg:text-6xl",
  "3xl": "text-3xl sm:text-4xl md:text-5xl lg:text-7xl",
} satisfies Record<NonNullable<SectionDesign["titleSize"]>, string>;

export function getTitleClasses(design: SectionDesign): string {
  return titleSizeMap[design.titleSize] ?? titleSizeMap.lg;
}

export function getTitleStyle(
  design: SectionDesign,
): React.CSSProperties | undefined {
  return design.titleColor ? { color: design.titleColor } : undefined;
}

export function getTextStyle(
  design: SectionDesign,
): React.CSSProperties | undefined {
  return design.textColor ? { color: design.textColor } : undefined;
}
```

**パターン解説**:

- **Mapping tables** : `satisfies` で網羅性チェック
- **`skipPadding`** : デフォルト padding を無視
- **`skipContainer`** : コンテナ div 省略（Hero 等の特殊レイアウト）
- **Background image + overlay** : opacity 調整可能
- **Helper functions** : `getTitleClasses()` などで reuse

---

## 7. イベントカレンダー Phase 1 実装チェックリスト

- [ ] **管理画面 CRUD ページ**
  - [ ] `/admin/events/` : PostTable + PostFilters パターンで実装
  - [ ] `/admin/events/new` : PostEditor パターンで実装
  - [ ] `/admin/events/[id]/edit` : PostEditor パターンで実装
  - [ ] `/admin/events/[id]` : AdminDetailLayout + DetailSection パターンで実装

- [ ] **ドメイン層**
  - [ ] `src/shared/domain/events/commands.ts` : CRUD コマンド
  - [ ] `src/shared/domain/events/admin-queries.ts` : 管理画面クエリー
  - [ ] `src/shared/domain/events/queries.ts` : 公開クエリー
  - [ ] `src/shared/domain/events/types.ts` : 型定義

- [ ] **Server Actions**
  - [ ] `src/app/(admin)/_shared/actions/event.ts` : CRUD + publish/unpublish

- [ ] **バリデーション**
  - [ ] `src/shared/lib/validations/event.ts` : フォーム + フィルター

- [ ] **公開セクション（オプション Phase 2）**
  - [ ] `src/app/(public)/_shared/components/EventListSection.tsx`
  - [ ] `src/shared/lib/validations/section.ts` : EVENT_LIST config

---

## まとめ

このドキュメントで以下を網羅しました：

1. **管理画面テーブル層** : PostTable, PostTableHeader, PostFilters, PostActionCell, ActionDropdown
2. **詳細ページ層** : AdminDetailLayout, DetailSection, DetailDeleteButton
3. **Server Action パターン** : executeAdminMutationResult, Zod + validation, キャッシュ無効化
4. **ドメイン層** : DomainError, 前提条件チェック, 並行実行, Prisma $transaction
5. **クエリー層** : WHERE 構築, count + findMany, Serialization
6. **バリデーション** : Zod schema（大規模 + 小規模）, transform, refine, 型ガード
7. **公開セクション層** : SectionRenderer（type 出し分け）, SectionWrapper（design 適用）

すべてを Posts リソース（既実装）をモデルに説明しました。
イベントカレンダー実装では、このパターンを Events リソースに適用してください。

---

**参考ファイル一覧**:

- `src/app/(admin)/admin/(dashboard)/posts/_components/*.tsx` (7 ファイル)
- `src/app/(admin)/admin/(dashboard)/_shared/components/*.tsx` (14+ ファイル)
- `src/app/(admin)/admin/(dashboard)/_shared/actions/inquiry.ts`
- `src/app/(admin)/admin/(dashboard)/_shared/actions/page-section.ts`
- `src/shared/domain/posts/commands.ts`, `admin-queries.ts`, `types.ts`
- `src/shared/lib/validations/section.ts` (4,000+ 行)
- `src/shared/lib/validations/coupon.ts`
- `src/app/(public)/_shared/components/sections/SectionRenderer.tsx`
- `src/app/(public)/_shared/components/sections/SectionWrapper.tsx`
