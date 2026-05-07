"use client";

/**
 * TagManager - タグ管理コンポーネント
 *
 * @description nuqs対応、検索・ソート・フィルター機能付き
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import { IconX, IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Checkbox,
  SubmitButton,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { SortableTableHead } from "@/admin/components/SortableTableHead";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  createPostTag,
  updatePostTag,
  deletePostTag,
} from "@/admin/actions/post/taxonomy";
import type { PostTagData } from "@/shared/domain/posts/types";
import type { PostTagInput } from "@/admin/lib/validations/post";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useTagFilters } from "../_hooks/use-taxonomy-filters";
import type { PostTaxonomySortField } from "@/shared/lib/nuqs";

// =============================================================================
// Types & Schemas
// =============================================================================

type TagFormData = {
  name: string;
  slug: string;
};

const tagFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "タグ名は必須です" })
    .max(50, { error: "タグ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
}) satisfies z.ZodType<TagFormData>;

async function fetchPostTags(): Promise<PostTagData[]> {
  return fetchAdminJson("/admin/api/post-tags");
}

// =============================================================================
// Tag Row
// =============================================================================

type TagRowProps = {
  tag: PostTagData;
  onEdit: (tag: PostTagData) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
};

function TagRow({ tag, onEdit, onDelete, isPending }: TagRowProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const formattedDate = new Date(tag.createdAt).toLocaleDateString("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });

  return (
    <TableRow>
      <TableCell className="font-medium">{tag.name}</TableCell>
      <TableCell className="text-muted-foreground">{tag.slug}</TableCell>
      <TableCell>{tag._count.posts}</TableCell>
      <TableCell className="text-muted-foreground">{formattedDate}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(tag)}
            disabled={isPending}
            aria-label={`${tag.name}タグを編集`}
          >
            編集
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            aria-label={`${tag.name}タグのSEO設定`}
          >
            <Link href={`/admin/posts/tags/${tag.id}`}>
              <IconSettings className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending || tag._count.posts > 0}
            onClick={() => setDeleteDialogOpen(true)}
            aria-label={`${tag.name}タグを削除`}
          >
            削除
          </Button>
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            itemName={tag.name}
            onConfirm={() => {
              onDelete(tag.id);
              setDeleteDialogOpen(false);
            }}
            isPending={isPending}
          />
        </div>
      </TableCell>
    </TableRow>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type TagManagerProps = {
  initialTags: PostTagData[];
};

export function TagManager({ initialTags }: TagManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [tags, setTags] = useState<PostTagData[]>(initialTags);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingTag, setEditingTag] = useState<PostTagData | null>(null);

  // Filters (nuqs)
  const {
    params: filterParams,
    setSearchDebounced,
    toggleSort,
    setUnusedOnly,
    reset: resetFilters,
  } = useTagFilters();

  // Filtered & Sorted Tags
  const filteredTags = (() => {
    let result = [...tags];

    // Search filter
    if (filterParams.search) {
      const searchLower = filterParams.search.toLowerCase();
      result = result.filter(
        (tag) =>
          tag.name.toLowerCase().includes(searchLower) ||
          tag.slug.toLowerCase().includes(searchLower),
      );
    }

    // Unused only filter
    if (filterParams.unusedOnly) {
      result = result.filter((tag) => tag._count.posts === 0);
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0;
      switch (filterParams.sortBy) {
        case "name":
          comparison = a.name.localeCompare(b.name, "ja");
          break;
        case "postCount":
          comparison = a._count.posts - b._count.posts;
          break;
        case "createdAt":
          comparison =
            new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
          break;
      }
      return filterParams.sortOrder === "desc" ? -comparison : comparison;
    });

    return result;
  })();

  // Form
  const form = useForm<TagFormData>({
    resolver: standardSchemaResolver(tagFormSchema),
    defaultValues: { name: "", slug: "" },
  });

  const openCreateDialog = () => {
    setEditingTag(null);
    form.reset({ name: "", slug: "" });
    setIsDialogOpen(true);
  };

  const openEditDialog = (tag: PostTagData) => {
    setEditingTag(tag);
    form.reset({ name: tag.name, slug: tag.slug });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: TagFormData) => {
    startTransition(async () => {
      const payload: PostTagInput = { name: data.name, slug: data.slug };

      if (editingTag) {
        const result = await updatePostTag(editingTag.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("タグを更新しました");
        const newTags = await fetchPostTags();
        startTransition(() => {
          setIsDialogOpen(false);
          setTags(newTags);
        });
        return;
      }

      const result = await createPostTag(payload);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("タグを作成しました");
      const newTags = await fetchPostTags();
      startTransition(() => {
        setIsDialogOpen(false);
        setTags(newTags);
      });
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deletePostTag(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }

      toast.success("タグを削除しました");
      const newTags = await fetchPostTags();
      startTransition(() => {
        setTags(newTags);
      });
    });
  };

  const generateSlug = () => {
    const name = form.getValues("name");
    if (name) {
      const slug = name
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .replace(/\s+/g, "-")
        .replace(/-+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 50);
      form.setValue("slug", slug);
    }
  };

  const hasFilters =
    filterParams.search !== "" ||
    filterParams.unusedOnly ||
    filterParams.sortBy !== "name" ||
    filterParams.sortOrder !== "asc";

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>タグ一覧</CardTitle>
          <Button onClick={openCreateDialog}>新規作成</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* フィルター */}
          <div className="flex flex-wrap items-center gap-4">
            {/* 検索 */}
            <div className="flex-1 min-w-[200px]">
              <Input
                type="search"
                placeholder="タグを検索..."
                defaultValue={filterParams.search}
                onChange={(e) => setSearchDebounced(e.target.value)}
                leadingIcon="IconSearch"
                aria-label="タグを検索"
              />
            </div>

            {/* 未使用のみ */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="unused-only"
                checked={filterParams.unusedOnly}
                onCheckedChange={(checked) => setUnusedOnly(checked === true)}
              />
              <Label htmlFor="unused-only" className="text-sm cursor-pointer">
                未使用のみ
              </Label>
            </div>

            {/* リセット */}
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <IconX className="mr-1 h-4 w-4" />
                リセット
              </Button>
            )}
          </div>

          {/* 結果件数 */}
          <div className="text-sm text-muted-foreground">
            {filteredTags.length === tags.length
              ? `${tags.length}件のタグ`
              : `${filteredTags.length}件 / ${tags.length}件のタグ`}
          </div>

          {/* テーブル */}
          {tags.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              タグがありません
            </div>
          ) : filteredTags.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              条件に一致するタグがありません
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <SortableTableHead<PostTaxonomySortField>
                    field="name"
                    currentSortBy={filterParams.sortBy}
                    currentSortOrder={filterParams.sortOrder}
                    onToggle={toggleSort}
                  >
                    タグ名
                  </SortableTableHead>
                  <TableHead className="w-40">スラッグ</TableHead>
                  <SortableTableHead<PostTaxonomySortField>
                    field="postCount"
                    currentSortBy={filterParams.sortBy}
                    currentSortOrder={filterParams.sortOrder}
                    onToggle={toggleSort}
                    className="w-24"
                  >
                    記事数
                  </SortableTableHead>
                  <SortableTableHead<PostTaxonomySortField>
                    field="createdAt"
                    currentSortBy={filterParams.sortBy}
                    currentSortOrder={filterParams.sortOrder}
                    onToggle={toggleSort}
                    className="w-32"
                  >
                    作成日
                  </SortableTableHead>
                  <TableHead className="w-48">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredTags.map((tag) => (
                  <TagRow
                    key={tag.id}
                    tag={tag}
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
                    isPending={isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* タグ作成/編集ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{editingTag ? "タグ編集" : "タグ作成"}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">タグ名</Label>
                <Input
                  id="tag-name"
                  {...form.register("name")}
                  placeholder="タグ名"
                  disabled={isPending}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tag-slug">スラッグ</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateSlug}
                    disabled={isPending}
                  >
                    名前から生成
                  </Button>
                </div>
                <Input
                  id="tag-slug"
                  {...form.register("slug")}
                  placeholder="tag-slug"
                  disabled={isPending}
                />
                {form.formState.errors.slug && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.slug.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <SubmitButton
                isPending={isPending}
                label={editingTag ? "更新" : "作成"}
                pendingLabel={editingTag ? "更新中..." : "作成中..."}
              />
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
