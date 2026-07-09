"use client";

/**
 * CategoryTable
 *
 * スペースカテゴリー一覧テーブル。`sortable`（検索・絞り込みなし）のとき
 * D&D 並び替えを有効化し、`updateSpaceCategoryOrder` に {id, sortOrder} を渡す。
 * sortOrder はシステム管理（手動入力なし、create=末尾自動採番 / reorder=D&D SSoT /
 * update=不変）。`startIndex` はページオフセットで、global な sortOrder を維持する。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  PublishSwitch,
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
import { stopRowClick } from "@/admin/components/table";
import { EmptyState } from "@/admin/components/EmptyState";
import { CuratedIcon } from "@/shared/components/icon-curation/CuratedIcon";
import {
  updateSpaceCategoryActive,
  updateSpaceCategoryOrder,
} from "@/admin/actions/space-category";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import { CategoryActionCell } from "./CategoryActionCell";
import type { SpaceCategoryWithStats } from "@/shared/lib/validations/space-category";

type CategoryTableProps = {
  readonly categories: SpaceCategoryWithStats[];
  /** 検索・絞り込みなしのとき true（D&D 並び替えを有効化） */
  readonly sortable: boolean;
  /** ページオフセット（global な sortOrder 維持用） */
  readonly startIndex: number;
};

type SortableRowProps = {
  readonly category: SpaceCategoryWithStats;
  readonly sortable: boolean;
  readonly isPending: boolean;
};

function SortableRow({ category, sortable, isPending }: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id, disabled: !sortable || isPending });

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
      <TableCell className="hidden w-12 md:table-cell" onClick={stopRowClick}>
        {sortable ? (
          <div {...attributes} {...listeners}>
            <DragHandle disabled={isPending} />
          </div>
        ) : (
          <span className="block h-4 w-4" aria-hidden="true" />
        )}
      </TableCell>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell className="hidden lg:table-cell">
        <span className="text-sm text-muted-foreground line-clamp-2">
          {category.description || "-"}
        </span>
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {category.icon ? (
          <span className="inline-flex items-center gap-2">
            <CuratedIcon
              name={category.icon}
              className="h-4 w-4 text-foreground"
            />
            <code className="text-xs text-muted-foreground">
              {category.icon}
            </code>
          </span>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="hidden lg:table-cell">
        {category.color ? (
          <div className="flex items-center gap-2">
            <div
              className="h-6 w-6 rounded border"
              style={{ backgroundColor: category.color }}
            />
            <code className="text-xs text-muted-foreground">
              {category.color}
            </code>
          </div>
        ) : (
          <span className="text-muted-foreground">-</span>
        )}
      </TableCell>
      <TableCell className="hidden text-right md:table-cell">
        <Badge variant="secondary">{category._count.spaces}件</Badge>
      </TableCell>
      <TableCell className="whitespace-nowrap" onClick={stopRowClick}>
        <PublishSwitch
          id={category.id}
          isPublished={category.isActive}
          onToggle={updateSpaceCategoryActive}
          resourceLabel={`${category.name} の有効状態`}
          label={{
            published: "アクティブ",
            unpublished: "非アクティブ",
          }}
        />
      </TableCell>
      <TableCell className="text-right" onClick={stopRowClick}>
        <CategoryActionCell category={category} />
      </TableCell>
    </TableRow>
  );
}

export function CategoryTable({
  categories: initialCategories,
  sortable,
  startIndex,
}: CategoryTableProps) {
  const router = useRouter();
  const [categories, setCategories] = useState<SpaceCategoryWithStats[]>(() => [
    ...initialCategories,
  ]);

  // React 19: props 変化を render 中に state へ同期
  const [previousInitial, setPreviousInitial] = useState(initialCategories);
  if (initialCategories !== previousInitial) {
    setPreviousInitial(initialCategories);
    setCategories([...initialCategories]);
  }

  const [isPending, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sortable || isPending) return;

    const oldIndex = categories.findIndex((c) => c.id === active.id);
    const newIndex = categories.findIndex((c) => c.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(categories, oldIndex, newIndex);
    setCategories(reordered);

    startTransition(async () => {
      const items = reordered.map((category, index) => ({
        id: category.id,
        sortOrder: startIndex + index,
      }));
      const result = await updateSpaceCategoryOrder(items);
      if (isMutationError(result)) {
        toast.error(result.error);
        setCategories([...initialCategories]);
        return;
      }
      toast.success("カテゴリーの並び順を更新しました");
      router.refresh();
    });
  };

  if (categories.length === 0) {
    return <EmptyState message="カテゴリーがありません" />;
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        {sortable
          ? "ドラッグ&ドロップで並び替えできます"
          : "並び替えは検索・絞り込みを解除すると有効になります"}
      </p>
      <div className="overflow-hidden rounded-lg border bg-card">
        <div className="overflow-x-auto">
          <DndContext
            id="space-category-sortable"
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
                    <TableHead className="hidden w-12 md:table-cell" />
                    <TableHead>カテゴリー名</TableHead>
                    <TableHead className="hidden lg:table-cell">説明</TableHead>
                    <TableHead className="hidden w-24 lg:table-cell">
                      アイコン
                    </TableHead>
                    <TableHead className="hidden w-24 lg:table-cell">
                      色
                    </TableHead>
                    <TableHead className="hidden w-24 text-right md:table-cell">
                      スペース数
                    </TableHead>
                    <TableHead className="w-28">状態</TableHead>
                    <TableHead className="w-32 text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {categories.map((category) => (
                    <SortableRow
                      key={category.id}
                      category={category}
                      sortable={sortable}
                      isPending={isPending}
                    />
                  ))}
                </TableBody>
              </Table>
            </SortableContext>
          </DndContext>
        </div>
      </div>
    </div>
  );
}
