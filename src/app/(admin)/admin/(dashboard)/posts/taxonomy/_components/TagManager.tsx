"use client";

/**
 * TagManager — タグ管理コンポーネント
 *
 * @description nuqs対応、検索・ソート・フィルター機能付き。
 * Dialog 内 form は conform `useActionState` + `useForm` (Variant A:
 * Dialog 開閉は親で管理、form は Dialog 内で独立 mount)。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { IconX, IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import { getFormProps, getInputProps, useForm } from "@conform-to/react";
import { parseWithZod } from "@conform-to/zod/v4";
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
  createPostTagAction,
  updatePostTagAction,
  deletePostTag,
} from "@/admin/actions/post/taxonomy";
import { tagFormSchema } from "./taxonomy-schema";
import type { PostTagData } from "@/shared/domain/posts/types";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useTagFilters } from "../_hooks/use-taxonomy-filters";
import type { PostTaxonomySortField } from "@/shared/lib/nuqs";

async function fetchPostTags(): Promise<PostTagData[]> {
  return fetchAdminJson("/admin/api/post-tags");
}

// =============================================================================
// Tag Row
// =============================================================================

type TagRowProps = {
  readonly tag: PostTagData;
  readonly onEdit: (tag: PostTagData) => void;
  readonly onDelete: (id: string) => void;
  readonly isPending: boolean;
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
              <IconSettings className="h-4 w-4" aria-hidden="true" />
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
// Tag Form Dialog (Create / Edit)
// =============================================================================

type TagFormDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingTag: PostTagData | null;
  readonly onSuccess: () => Promise<void>;
};

function TagFormDialog({
  open,
  onOpenChange,
  editingTag,
  onSuccess,
}: TagFormDialogProps) {
  const isEdit = editingTag !== null;
  const boundAction = isEdit
    ? updatePostTagAction.bind(null, editingTag.id)
    : createPostTagAction;

  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `tag-edit-${editingTag.id}` : "tag-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: tagFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      name: editingTag?.name ?? "",
      slug: editingTag?.slug ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(isEdit ? "タグを更新しました" : "タグを作成しました");
      onOpenChange(false);
      void onSuccess();
    }
  }, [lastResult, isEdit, onOpenChange, onSuccess]);

  const handleGenerateSlug = () => {
    const nameInput = document.getElementById(fields.name.id);
    const slugInput = document.getElementById(fields.slug.id);
    if (
      !(nameInput instanceof HTMLInputElement) ||
      !(slugInput instanceof HTMLInputElement)
    )
      return;
    const name = nameInput.value;
    if (!name) return;
    const slug = name
      .toLowerCase()
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .replace(/\s+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 50);
    slugInput.value = slug;
    slugInput.dispatchEvent(new Event("input", { bubbles: true }));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <form {...getFormProps(form)} action={action}>
          <DialogHeader>
            <DialogTitle>{isEdit ? "タグ編集" : "タグ作成"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={fields.name.id}>タグ名</Label>
              <Input
                {...getInputProps(fields.name, { type: "text" })}
                placeholder="タグ名"
                disabled={isPending}
              />
              {fields.name.errors && (
                <p
                  id={fields.name.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.name.errors.join(", ")}
                </p>
              )}
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label htmlFor={fields.slug.id}>スラッグ</Label>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={handleGenerateSlug}
                  disabled={isPending}
                >
                  名前から生成
                </Button>
              </div>
              <Input
                {...getInputProps(fields.slug, { type: "text" })}
                placeholder="tag-slug"
                disabled={isPending}
              />
              {fields.slug.errors && (
                <p
                  id={fields.slug.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.slug.errors.join(", ")}
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              キャンセル
            </Button>
            <SubmitButton
              isPending={isPending}
              label={isEdit ? "更新" : "作成"}
              pendingLabel={isEdit ? "更新中..." : "作成中..."}
            />
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// =============================================================================
// Main Component
// =============================================================================

type TagManagerProps = {
  readonly initialTags: PostTagData[];
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

    if (filterParams.search) {
      const searchLower = filterParams.search.toLowerCase();
      result = result.filter(
        (tag) =>
          tag.name.toLowerCase().includes(searchLower) ||
          tag.slug.toLowerCase().includes(searchLower),
      );
    }

    if (filterParams.unusedOnly) {
      result = result.filter((tag) => tag._count.posts === 0);
    }

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

  const openCreateDialog = () => {
    setEditingTag(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (tag: PostTagData) => {
    setEditingTag(tag);
    setIsDialogOpen(true);
  };

  const refreshTags = async () => {
    const newTags = await fetchPostTags();
    startTransition(() => {
      setTags(newTags);
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
      await refreshTags();
    });
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

            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <IconX className="mr-1 h-4 w-4" aria-hidden="true" />
                リセット
              </Button>
            )}
          </div>

          <div className="text-sm text-muted-foreground">
            {filteredTags.length === tags.length
              ? `${tags.length}件のタグ`
              : `${filteredTags.length}件 / ${tags.length}件のタグ`}
          </div>

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

      {/* タグ作成/編集ダイアログ — 開いている時のみ mount で defaultValue を確実に反映 */}
      {isDialogOpen && (
        <TagFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          editingTag={editingTag}
          onSuccess={refreshTags}
        />
      )}
    </>
  );
}
