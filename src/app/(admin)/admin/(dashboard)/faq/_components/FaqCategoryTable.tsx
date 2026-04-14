"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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
import { DragHandle } from "@/admin/components/ui/sortable";
import { EmptyState } from "@/admin/components/EmptyState";
import { reorderFaqCategories } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import type { FaqCategoryWithItems } from "@/shared/domain/faq/types";
import { FaqCategoryActionCell } from "./FaqCategoryActionCell";

type FaqCategoryTableProps = {
  readonly initialCategories: readonly FaqCategoryWithItems[];
};

type SortableRowProps = {
  readonly category: FaqCategoryWithItems;
};

function SortableCategoryRow({ category }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        "group",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          {category.iconEmoji && (
            <span className="text-lg" aria-hidden="true">
              {category.iconEmoji}
            </span>
          )}
          <Link
            href={`/admin/faq/categories/${category.id}/edit`}
            className="font-medium hover:underline"
          >
            {category.name}
          </Link>
          {!category.isActive && <Badge variant="secondary">非公開</Badge>}
        </div>
      </TableCell>
      <TableCell className="hidden text-muted-foreground md:table-cell">
        {category.slug}
      </TableCell>
      <TableCell className="hidden md:table-cell">
        <Badge variant="outline">{category.items.length}件</Badge>
      </TableCell>
      <TableCell className="hidden text-muted-foreground lg:table-cell">
        {category.description || "-"}
      </TableCell>
      <TableCell className="text-right">
        <FaqCategoryActionCell
          id={category.id}
          name={category.name}
          itemCount={category.items.length}
        />
      </TableCell>
    </TableRow>
  );
}

export function FaqCategoryTable({ initialCategories }: FaqCategoryTableProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<FaqCategoryWithItems[]>(() => [
    ...initialCategories,
  ]);
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    startTransition(async () => {
      const orderedIds = reordered.map((c) => c.id);
      const result = await reorderFaqCategories(orderedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setCategories([...initialCategories]);
        return;
      }
      toast.success("カテゴリの並び順を更新しました");
      router.refresh();
    });
  };

  if (categories.length === 0) {
    return (
      <EmptyState
        message="カテゴリがまだ登録されていません"
        action={{
          label: "最初のカテゴリを作成",
          href: "/admin/faq/categories/new",
        }}
      />
    );
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        ドラッグ&ドロップでカテゴリの並び順を変更できます
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <DndContext
            id="faq-category-sortable"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={categories.map((c) => c.id)}
              strategy={verticalListSortingStrategy}
            >
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-12" />
                    <TableHead>カテゴリ名</TableHead>
                    <TableHead className="hidden md:table-cell">
                      スラッグ
                    </TableHead>
                    <TableHead className="hidden md:table-cell">
                      質問数
                    </TableHead>
                    <TableHead className="hidden lg:table-cell">説明</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <SortableCategoryRow
                      key={category.id}
                      category={category}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </div>
      </div>
      <div className="flex justify-end">
        <Button asChild variant="outline" size="sm">
          <Link href="/admin/faq/categories/new">+ カテゴリを追加</Link>
        </Button>
      </div>
    </div>
  );
}
