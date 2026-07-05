"use client";

/**
 * CategoryManager — カテゴリ管理コンポーネント
 *
 * @description nuqs対応、検索機能付き、D&D並べ替え対応。
 * Dialog 内 form は conform `useActionState` + `useForm` (Variant A:
 * Dialog 開閉は親で管理、form は Dialog 内で独立 mount)。
 */

import { useActionState, useEffect, useState, useTransition } from "react";
import { toast } from "sonner";
import { IconX, IconSettings } from "@tabler/icons-react";
import Link from "next/link";
import {
  getFormProps,
  getInputProps,
  getTextareaProps,
  useForm,
} from "@conform-to/react";
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
  SubmitButton,
  Textarea,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  toTranslate3d,
  type DragEndEvent,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { DragHandle } from "@/admin/components/ui/sortable";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  createPostCategoryAction,
  updatePostCategoryAction,
  deletePostCategory,
  updatePostCategoryOrder,
} from "@/admin/actions/post/taxonomy";
import { categoryFormSchema } from "./taxonomy-schema";
import type { PostCategoryData } from "@/shared/domain/posts/types";
import { cn } from "@/shared/lib/cn";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useCategoryFilters } from "../_hooks/use-taxonomy-filters";

async function fetchPostCategories(): Promise<PostCategoryData[]> {
  return fetchAdminJson("/admin/api/post-categories");
}

// =============================================================================
// Sortable Category Row
// =============================================================================

type SortableCategoryRowProps = {
  readonly category: PostCategoryData;
  readonly onEdit: (category: PostCategoryData) => void;
  readonly onDelete: (id: string) => void;
  readonly isPending: boolean;
  readonly isSortable: boolean;
};

function SortableCategoryRow({
  category,
  onEdit,
  onDelete,
  isPending,
  isSortable,
}: SortableCategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: !isSortable || isPending });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "z-50 shadow-lg ring-2 ring-primary/20")}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle disabled={!isSortable || isPending} />
        </div>
      </TableCell>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell className="text-muted-foreground">{category.slug}</TableCell>
      <TableCell>{category._count.posts}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(category)}
            disabled={isPending}
            aria-label={`${category.name}カテゴリを編集`}
          >
            編集
          </Button>
          <Button
            variant="outline"
            size="sm"
            asChild
            aria-label={`${category.name}カテゴリのSEO設定`}
          >
            <Link href={`/admin/posts/categories/${category.id}`}>
              <IconSettings className="h-4 w-4" />
            </Link>
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending || category._count.posts > 0}
            onClick={() => setDeleteDialogOpen(true)}
            aria-label={`${category.name}カテゴリを削除`}
          >
            削除
          </Button>
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            itemName={category.name}
            onConfirm={() => {
              onDelete(category.id);
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
// Category Form Dialog (Create / Edit)
// =============================================================================

type CategoryFormDialogProps = {
  readonly open: boolean;
  readonly onOpenChange: (open: boolean) => void;
  readonly editingCategory: PostCategoryData | null;
  readonly onSuccess: () => Promise<void>;
};

function CategoryFormDialog({
  open,
  onOpenChange,
  editingCategory,
  onSuccess,
}: CategoryFormDialogProps) {
  const isEdit = editingCategory !== null;
  // bind editingCategory.id for update; create action takes (prev, formData) directly
  const boundAction = isEdit
    ? updatePostCategoryAction.bind(null, editingCategory.id)
    : createPostCategoryAction;

  const [lastResult, action, isPending] = useActionState(
    boundAction,
    undefined,
  );

  const [form, fields] = useForm({
    id: isEdit ? `category-edit-${editingCategory.id}` : "category-create",
    lastResult,
    onValidate({ formData }) {
      return parseWithZod(formData, { schema: categoryFormSchema });
    },
    shouldValidate: "onBlur",
    shouldRevalidate: "onInput",
    defaultValue: {
      name: editingCategory?.name ?? "",
      slug: editingCategory?.slug ?? "",
      description: editingCategory?.description ?? "",
    },
  });

  useEffect(() => {
    if (lastResult && lastResult.initialValue === null) {
      toast.success(
        isEdit ? "カテゴリを更新しました" : "カテゴリを作成しました",
      );
      onOpenChange(false);
      void onSuccess();
    }
  }, [lastResult, isEdit, onOpenChange, onSuccess]);

  // 名前 → スラッグ自動生成（uncontrolled input の current value から計算）
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
            <DialogTitle>
              {isEdit ? "カテゴリー編集" : "カテゴリー作成"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor={fields.name.id}>カテゴリー名</Label>
              <Input
                {...getInputProps(fields.name, { type: "text" })}
                placeholder="カテゴリー名"
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
                placeholder="category-slug"
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

            <div className="space-y-2">
              <Label htmlFor={fields.description.id}>説明</Label>
              <Textarea
                {...getTextareaProps(fields.description)}
                placeholder="カテゴリーの説明"
                rows={2}
                disabled={isPending}
              />
              {fields.description.errors && (
                <p
                  id={fields.description.errorId}
                  className="text-sm text-destructive"
                >
                  {fields.description.errors.join(", ")}
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

type CategoryManagerProps = {
  readonly initialCategories: PostCategoryData[];
};

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const [isPending, startTransition] = useTransition();
  const [categories, setCategories] =
    useState<PostCategoryData[]>(initialCategories);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<PostCategoryData | null>(null);

  // Filters (nuqs)
  const {
    params: filterParams,
    setSearchDebounced,
    reset: resetFilters,
  } = useCategoryFilters();

  // Filtered Categories
  const filteredCategories = (() => {
    if (!filterParams.search) return categories;
    const searchLower = filterParams.search.toLowerCase();
    return categories.filter(
      (cat) =>
        cat.name.toLowerCase().includes(searchLower) ||
        cat.slug.toLowerCase().includes(searchLower) ||
        (cat.description &&
          cat.description.toLowerCase().includes(searchLower)),
    );
  })();

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const openCreateDialog = () => {
    setEditingCategory(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: PostCategoryData) => {
    setEditingCategory(category);
    setIsDialogOpen(true);
  };

  const refreshCategories = async () => {
    const newCategories = await fetchPostCategories();
    startTransition(() => {
      setCategories(newCategories);
    });
  };

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deletePostCategory(id);
      if (isMutationError(result)) {
        toast.error(result.error);
        return;
      }
      toast.success("カテゴリを削除しました");
      await refreshCategories();
    });
  };

  const hasFilters = filterParams.search !== "";
  const isSortable = !hasFilters;

  const handleDragEnd = (event: DragEndEvent) => {
    if (!isSortable || isPending) return;

    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((cat) => cat.id === active.id);
    const newIndex = categories.findIndex((cat) => cat.id === over.id);

    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    const updates = reordered.map((cat, index) => ({
      id: cat.id,
      order: index,
    }));

    startTransition(async () => {
      const result = await updatePostCategoryOrder(updates);
      if (isMutationError(result)) {
        toast.error(result.error);
        await refreshCategories();
      }
    });
  };

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>カテゴリー一覧</CardTitle>
          <Button onClick={openCreateDialog}>新規作成</Button>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* フィルター */}
          <div className="flex flex-wrap items-center gap-4">
            <div className="flex-1 min-w-[200px]">
              <Input
                type="search"
                placeholder="カテゴリーを検索..."
                defaultValue={filterParams.search}
                onChange={(e) => setSearchDebounced(e.target.value)}
                leadingIcon="IconSearch"
                aria-label="カテゴリーを検索"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <IconX className="mr-1 h-4 w-4" aria-hidden="true" />
                リセット
              </Button>
            )}
          </div>

          {/* 結果件数 */}
          <div className="text-sm text-muted-foreground">
            {filteredCategories.length === categories.length
              ? `${categories.length}件のカテゴリー`
              : `${filteredCategories.length}件 / ${categories.length}件のカテゴリー`}
          </div>

          {/* テーブル */}
          {categories.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              カテゴリーがありません
            </div>
          ) : filteredCategories.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              条件に一致するカテゴリーがありません
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground">
                {isSortable
                  ? "ドラッグ&ドロップで順序を変更できます"
                  : "並び替えは検索を解除すると有効になります"}
              </p>
              <DndContext
                id="category-sortable"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={filteredCategories.map((cat) => cat.id)}
                  strategy={verticalListSortingStrategy}
                  disabled={!isSortable || isPending}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>カテゴリー名</TableHead>
                        <TableHead className="w-40">スラッグ</TableHead>
                        <TableHead className="w-24">記事数</TableHead>
                        <TableHead className="w-48">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCategories.map((category) => (
                        <SortableCategoryRow
                          key={category.id}
                          category={category}
                          onEdit={openEditDialog}
                          onDelete={handleDelete}
                          isPending={isPending}
                          isSortable={isSortable}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </>
          )}
        </CardContent>
      </Card>

      {/* カテゴリ作成/編集ダイアログ — 開いている時のみ mount で defaultValue を確実に反映 */}
      {isDialogOpen && (
        <CategoryFormDialog
          open={isDialogOpen}
          onOpenChange={setIsDialogOpen}
          editingCategory={editingCategory}
          onSuccess={refreshCategories}
        />
      )}
    </>
  );
}
