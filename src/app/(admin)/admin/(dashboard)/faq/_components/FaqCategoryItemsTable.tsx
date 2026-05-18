"use client";

/**
 * FaqCategoryItemsTable
 *
 * /admin/faq/[categoryId] 詳細ページ配下の質問一覧テーブル。
 * 常に単一カテゴリにスコープされているため、カテゴリ列は表示せず、
 * `sortBy === "order"` のときは常に DnD 並び替えを有効化する。
 *
 * 行クリック → 編集 Dialog を親で開く（`onEditItem` コールバック）。
 * プレビューサイドシートは廃止（edit Dialog が直接開くため不要）。
 */

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Checkbox,
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
import { EmptyState } from "@/admin/components/EmptyState";
import { SortableColumnHeader, stopRowClick } from "@/admin/components/table";
import { reorderFaqItems, updateFaqItemPublished } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import { useQueryStates } from "nuqs";
import {
  adminFaqCategoryDetailSearchParamsParsers,
  type AdminFaqItemSortBy,
} from "@/shared/lib/nuqs";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { FaqItemActionCell } from "./FaqItemActionCell";
import { FaqBulkActions } from "./FaqBulkActions";

type FaqCategoryItemsTableProps = {
  readonly categoryId: string;
  readonly items: readonly FaqItemWithCategory[];
  readonly allCategories: readonly { id: string; name: string }[];
  readonly currentSortBy: AdminFaqItemSortBy;
  readonly onEditItem: (item: FaqItemWithCategory) => void;
  readonly onAddItem: () => void;
};

type SortableRowProps = {
  readonly item: FaqItemWithCategory;
  readonly selected: boolean;
  readonly onToggle: (id: string) => void;
  readonly onEdit: (item: FaqItemWithCategory) => void;
  readonly sortable: boolean;
};

function SortableRow({
  item,
  selected,
  onToggle,
  onEdit,
  sortable,
}: SortableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id, disabled: !sortable });

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
      <TableCell className="w-12" onClick={stopRowClick}>
        {sortable ? (
          <div {...attributes} {...listeners}>
            <DragHandle />
          </div>
        ) : (
          <span className="block h-4 w-4" aria-hidden="true" />
        )}
      </TableCell>
      <TableCell className="w-10" onClick={stopRowClick}>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(item.id)}
          aria-label={`${item.question}を選択`}
        />
      </TableCell>
      <TableCell onClick={() => onEdit(item)} className="cursor-pointer">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{item.question}</span>
          {item.answer && (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {item.answer}
            </span>
          )}
        </div>
      </TableCell>
      <TableCell
        className="hidden text-right text-muted-foreground lg:table-cell tabular-nums"
        onClick={() => onEdit(item)}
      >
        {item.viewCount.toLocaleString("ja-JP")}
      </TableCell>
      <TableCell
        className="hidden text-muted-foreground lg:table-cell"
        onClick={() => onEdit(item)}
      >
        {new Date(item.updatedAt).toLocaleDateString("ja-JP")}
      </TableCell>
      <TableCell className="hidden md:table-cell" onClick={stopRowClick}>
        <PublishSwitch
          id={item.id}
          isPublished={item.isPublished}
          onToggle={updateFaqItemPublished}
          resourceLabel={`${item.question} の公開状態`}
          label={{ published: "公開中", unpublished: "下書き" }}
        />
      </TableCell>
      <TableCell className="text-right" onClick={stopRowClick}>
        <FaqItemActionCell
          id={item.id}
          question={item.question}
          isPublished={item.isPublished}
          onEdit={() => onEdit(item)}
        />
      </TableCell>
    </TableRow>
  );
}

export function FaqCategoryItemsTable({
  categoryId,
  items: initialItems,
  allCategories,
  currentSortBy,
  onEditItem,
  onAddItem,
}: FaqCategoryItemsTableProps) {
  const router = useRouter();
  const sortable = currentSortBy === "order";
  const [items, setItems] = useState<FaqItemWithCategory[]>(() => [
    ...initialItems,
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  // React 19 推奨: props 変化を render 中に state へ同期
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [previousInitialItems, setPreviousInitialItems] =
    useState(initialItems);
  if (initialItems !== previousInitialItems) {
    setPreviousInitialItems(initialItems);
    setItems([...initialItems]);
    setSelectedIds([]);
  }

  const [, startTransition] = useTransition();
  const [, setParams] = useQueryStates(
    adminFaqCategoryDetailSearchParamsParsers,
    {
      history: "push",
      shallow: false,
      startTransition,
    },
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !sortable) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    startTransition(async () => {
      const orderedIds = reordered.map((i) => i.id);
      const result = await reorderFaqItems(categoryId, orderedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setItems([...initialItems]);
        return;
      }
      toast.success("質問の並び順を更新しました");
      router.refresh();
    });
  };

  const handleSort = (column: AdminFaqItemSortBy) => {
    void setParams((prev) => ({
      sortBy: column,
      sortOrder:
        prev.sortBy === column
          ? prev.sortOrder === "asc"
            ? "desc"
            : "asc"
          : column === "viewCount"
            ? "desc"
            : "asc",
      page: 1,
    }));
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
    );
  };

  const allSelected =
    items.length > 0 && items.every((i) => selectedIds.includes(i.id));
  const someSelected = selectedIds.length > 0 && !allSelected;

  const toggleAll = () => {
    setSelectedIds(allSelected ? [] : items.map((i) => i.id));
  };

  if (items.length === 0) {
    return (
      <EmptyState
        message="このカテゴリにはまだ質問がありません"
        action={{
          label: "最初の質問を追加",
          onClick: onAddItem,
        }}
      />
    );
  }

  return (
    <>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {sortable
            ? "ドラッグ&ドロップで並び替え / 行クリックで編集 / チェックボックスで一括操作"
            : "行クリックで編集 / チェックボックスで一括操作 / 並び替えは「表示順」ソート時のみ"}
        </p>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <DndContext
              id="faq-category-items-sortable"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={handleDragEnd}
            >
              <SortableContext
                items={items.map((i) => i.id)}
                strategy={verticalListSortingStrategy}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12" />
                      <TableHead className="w-10">
                        <Checkbox
                          checked={allSelected}
                          aria-checked={
                            allSelected
                              ? "true"
                              : someSelected
                                ? "mixed"
                                : "false"
                          }
                          onCheckedChange={toggleAll}
                          aria-label="すべて選択"
                        />
                      </TableHead>
                      <TableHead>質問</TableHead>
                      <SortableColumnHeader
                        column="viewCount"
                        currentSortBy={currentSortBy}
                        currentSortOrder="desc"
                        onSort={handleSort}
                        className="hidden text-right lg:table-cell"
                      >
                        閲覧数
                      </SortableColumnHeader>
                      <SortableColumnHeader
                        column="updatedAt"
                        currentSortBy={currentSortBy}
                        currentSortOrder="desc"
                        onSort={handleSort}
                        className="hidden lg:table-cell"
                      >
                        更新日時
                      </SortableColumnHeader>
                      <TableHead className="hidden md:table-cell">
                        公開状態
                      </TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <SortableRow
                        key={item.id}
                        item={item}
                        selected={selectedIds.includes(item.id)}
                        onToggle={toggleSelection}
                        onEdit={onEditItem}
                        sortable={sortable}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          </div>
        </div>
      </div>

      <FaqBulkActions
        selectedIds={selectedIds}
        categories={allCategories}
        onClear={() => setSelectedIds([])}
      />
    </>
  );
}
