"use client";

/**
 * CategoryManager - カテゴリ管理コンポーネント
 *
 * @description nuqs対応、検索機能付き、D&D並べ替え対応
 */

import { useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import { standardSchemaResolver } from "@hookform/resolvers/standard-schema";
import { z } from "zod";
import { toast } from "sonner";
import { Search, X, Settings } from "lucide-react";
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
  CSS,
  type DragEndEvent,
} from "@/admin/components/ui";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { DragHandle } from "@/admin/components/ui/sortable";
import { fetchAdminJson } from "@/admin/lib/admin-api-client";
import {
  createPostCategory,
  updatePostCategory,
  deletePostCategory,
  updatePostCategoryOrder,
} from "@/admin/actions/post";
import type { PostCategoryData } from "@/shared/domain/posts/types";
import type { PostCategoryInput } from "@/admin/lib/validations/post";
import { cn } from "@/shared/lib/cn";
import { isMutationError } from "@/shared/lib/mutation-result";
import { useCategoryFilters } from "../_hooks/use-taxonomy-filters";

// =============================================================================
// Types & Schemas
// =============================================================================

const categoryFormSchema = z.object({
  name: z
    .string()
    .min(1, { error: "カテゴリ名は必須です" })
    .max(50, { error: "カテゴリ名は50文字以内" }),
  slug: z
    .string()
    .min(1, { error: "スラッグは必須です" })
    .max(50)
    .regex(/^[a-z0-9-]+$/, { error: "スラッグは小文字英数字とハイフンのみ" }),
  description: z.string().max(200).optional(),
  order: z.number().int().min(0),
});

type CategoryFormData = z.infer<typeof categoryFormSchema>;

async function fetchPostCategories(): Promise<PostCategoryData[]> {
  return fetchAdminJson("/admin/api/post-categories");
}

// =============================================================================
// Sortable Category Row
// =============================================================================

type SortableCategoryRowProps = {
  category: PostCategoryData;
  onEdit: (category: PostCategoryData) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
};

function SortableCategoryRow({
  category,
  onEdit,
  onDelete,
  isPending,
}: SortableCategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "z-50 bg-muted/80 shadow-lg")}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
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
              <Settings className="h-4 w-4" />
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
// Main Component
// =============================================================================

type CategoryManagerProps = {
  initialCategories: PostCategoryData[];
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

  // Form
  const form = useForm<CategoryFormData, unknown, CategoryFormData>({
    resolver: standardSchemaResolver(categoryFormSchema),
    defaultValues: { name: "", slug: "", description: "", order: 0 },
  });

  const openCreateDialog = () => {
    setEditingCategory(null);
    form.reset({
      name: "",
      slug: "",
      description: "",
      order: categories.length,
    });
    setIsDialogOpen(true);
  };

  const openEditDialog = (category: PostCategoryData) => {
    setEditingCategory(category);
    form.reset({
      name: category.name,
      slug: category.slug,
      description: category.description ?? "",
      order: category.order,
    });
    setIsDialogOpen(true);
  };

  const onSubmit = (data: CategoryFormData) => {
    startTransition(async () => {
      const payload: PostCategoryInput = {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        order: data.order,
      };

      if (editingCategory) {
        const result = await updatePostCategory(editingCategory.id, payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("カテゴリを更新しました");
        const newCategories = await fetchPostCategories();
        startTransition(() => {
          setIsDialogOpen(false);
          setCategories(newCategories);
        });
      } else {
        const result = await createPostCategory(payload);
        if (isMutationError(result)) {
          toast.error(result.error);
          return;
        }

        toast.success("カテゴリを作成しました");
        const newCategories = await fetchPostCategories();
        startTransition(() => {
          setIsDialogOpen(false);
          setCategories(newCategories);
        });
      }
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
      const newCategories = await fetchPostCategories();
      startTransition(() => {
        setCategories(newCategories);
      });
    });
  };

  const handleDragEnd = (event: DragEndEvent) => {
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
        const newCategories = await fetchPostCategories();
        startTransition(() => {
          setCategories(newCategories);
        });
      }
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

  const hasFilters = filterParams.search !== "";

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
            <div className="relative flex-1 min-w-[200px]">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                type="search"
                placeholder="カテゴリーを検索..."
                defaultValue={filterParams.search}
                onChange={(e) => setSearchDebounced(e.target.value)}
                className="pl-9"
                aria-label="カテゴリーを検索"
              />
            </div>
            {hasFilters && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
                <X className="mr-1 h-4 w-4" />
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
                ドラッグ&ドロップで順序を変更できます
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

      {/* カテゴリ作成/編集ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? "カテゴリー編集" : "カテゴリー作成"}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">カテゴリー名</Label>
                <Input
                  id="category-name"
                  {...form.register("name")}
                  placeholder="カテゴリー名"
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
                  <Label htmlFor="category-slug">スラッグ</Label>
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
                  id="category-slug"
                  {...form.register("slug")}
                  placeholder="category-slug"
                  disabled={isPending}
                />
                {form.formState.errors.slug && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.slug.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">説明</Label>
                <Textarea
                  id="category-description"
                  {...form.register("description")}
                  placeholder="カテゴリーの説明"
                  rows={2}
                  disabled={isPending}
                />
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
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? editingCategory
                    ? "更新中..."
                    : "作成中..."
                  : editingCategory
                    ? "更新"
                    : "作成"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
