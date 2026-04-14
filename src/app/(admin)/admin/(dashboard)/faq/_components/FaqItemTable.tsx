"use client";

import { useState, useTransition, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import {
  Badge,
  Checkbox,
  Table,
  TableBody,
  TableCell,
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
import { reorderFaqItems } from "@/admin/actions/faq";
import { isMutationError } from "@/shared/lib/mutation-result";
import { cn } from "@/shared/lib/cn";
import type { FaqItemWithCategory } from "@/shared/domain/faq/types";
import { FaqItemActionCell } from "./FaqItemActionCell";
import { FaqBulkActions } from "./FaqBulkActions";
import { FaqItemPreviewSheet } from "./FaqItemPreviewSheet";
import { FaqItemTableHeader } from "./FaqItemTableHeader";
import type { AdminFaqItemSortBy } from "@/shared/lib/nuqs";

type FaqItemTableProps = {
  readonly initialItems: readonly FaqItemWithCategory[];
  /** カテゴリでフィルタ済みか（単一カテゴリ選択時のみ reorder 有効） */
  readonly activeCategoryId: string;
  /** 全カテゴリ（バルク移動先の選択肢） */
  readonly allCategories: readonly { id: string; name: string }[];
  /** 現在の並び順 — "order" 以外のとき dnd は無効化 */
  readonly currentSortBy: AdminFaqItemSortBy;
};

type RowPresentationalProps = {
  readonly item: FaqItemWithCategory;
  readonly selected: boolean;
  readonly onToggle: (id: string) => void;
  readonly onPreview: (item: FaqItemWithCategory) => void;
  readonly showCategory: boolean;
};

/** インタラクティブ要素クリック時に行クリック（preview）を遮断 */
const stopRowClick = (e: MouseEvent) => {
  e.stopPropagation();
};

function ItemRowContent({
  item,
  selected,
  onToggle,
  onPreview,
  showCategory,
}: RowPresentationalProps) {
  return (
    <>
      <TableCell className="w-10" onClick={stopRowClick}>
        <Checkbox
          checked={selected}
          onCheckedChange={() => onToggle(item.id)}
          aria-label={`${item.question}を選択`}
        />
      </TableCell>
      <TableCell onClick={() => onPreview(item)} className="cursor-pointer">
        <div className="flex flex-col gap-1">
          <span className="font-medium">{item.question}</span>
          {item.answerPlainText && (
            <span className="line-clamp-1 text-xs text-muted-foreground">
              {item.answerPlainText}
            </span>
          )}
        </div>
      </TableCell>
      {showCategory && (
        <TableCell
          className="hidden md:table-cell"
          onClick={() => onPreview(item)}
        >
          <Badge variant="outline">{item.category.name}</Badge>
        </TableCell>
      )}
      <TableCell
        className="hidden md:table-cell"
        onClick={() => onPreview(item)}
      >
        <Badge variant={item.isPublished ? "default" : "secondary"}>
          {item.isPublished ? "公開中" : "下書き"}
        </Badge>
      </TableCell>
      <TableCell
        className="hidden text-right text-muted-foreground lg:table-cell tabular-nums"
        onClick={() => onPreview(item)}
      >
        {item.viewCount.toLocaleString("ja-JP")}
      </TableCell>
      <TableCell
        className="hidden text-muted-foreground lg:table-cell"
        onClick={() => onPreview(item)}
      >
        {new Date(item.updatedAt).toLocaleDateString("ja-JP")}
      </TableCell>
      <TableCell className="text-right" onClick={stopRowClick}>
        <FaqItemActionCell
          id={item.id}
          question={item.question}
          isPublished={item.isPublished}
        />
      </TableCell>
    </>
  );
}

function StaticItemRow(props: RowPresentationalProps) {
  return (
    <TableRow>
      <TableCell className="w-8" aria-hidden="true" />
      <ItemRowContent {...props} />
    </TableRow>
  );
}

type SortableItemRowProps = RowPresentationalProps;

function SortableItemRow(props: SortableItemRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: props.item.id });

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
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <ItemRowContent {...props} />
    </TableRow>
  );
}

export function FaqItemTable({
  initialItems,
  activeCategoryId,
  allCategories,
  currentSortBy,
}: FaqItemTableProps) {
  const router = useRouter();
  // dnd は「単一カテゴリ絞り込み + sortBy=order」のときのみ有効化
  const isSortable = activeCategoryId !== "" && currentSortBy === "order";
  const [items, setItems] = useState<FaqItemWithCategory[]>(() => [
    ...initialItems,
  ]);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [previewItem, setPreviewItem] = useState<FaqItemWithCategory | null>(
    null,
  );
  // React 19 推奨: 親 props の変化を render 中に検知して state を同期
  // https://react.dev/learn/you-might-not-need-an-effect#adjusting-some-state-when-a-prop-changes
  const [previousInitialItems, setPreviousInitialItems] =
    useState(initialItems);
  if (initialItems !== previousInitialItems) {
    setPreviousInitialItems(initialItems);
    setItems([...initialItems]);
    setSelectedIds([]);
  }
  const [, startTransition] = useTransition();

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id || !isSortable) return;

    const oldIndex = items.findIndex((i) => i.id === active.id);
    const newIndex = items.findIndex((i) => i.id === over.id);
    if (oldIndex === -1 || newIndex === -1) return;

    const reordered = arrayMove(items, oldIndex, newIndex);
    setItems(reordered);

    startTransition(async () => {
      const orderedIds = reordered.map((i) => i.id);
      const result = await reorderFaqItems(activeCategoryId, orderedIds);
      if (isMutationError(result)) {
        toast.error(result.error);
        setItems([...initialItems]);
        return;
      }
      toast.success("質問の並び順を更新しました");
      router.refresh();
    });
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
        message="条件に一致する質問がありません"
        action={{ label: "質問を追加", href: "/admin/faq/items/new" }}
      />
    );
  }

  const sortableTable = (
    <Table>
      <FaqItemTableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onToggleAll={toggleAll}
        showCategory={false}
        sortable
      />
      <TableBody>
        {items.map((item) => (
          <SortableItemRow
            key={item.id}
            item={item}
            selected={selectedIds.includes(item.id)}
            onToggle={toggleSelection}
            onPreview={setPreviewItem}
            showCategory={false}
          />
        ))}
      </TableBody>
    </Table>
  );

  const staticTable = (
    <Table>
      <FaqItemTableHeader
        allSelected={allSelected}
        someSelected={someSelected}
        onToggleAll={toggleAll}
        showCategory
        sortable={false}
      />
      <TableBody>
        {items.map((item) => (
          <StaticItemRow
            key={item.id}
            item={item}
            selected={selectedIds.includes(item.id)}
            onToggle={toggleSelection}
            onPreview={setPreviewItem}
            showCategory
          />
        ))}
      </TableBody>
    </Table>
  );

  return (
    <>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          {isSortable
            ? "ドラッグ&ドロップで並び替え / 行クリックでプレビュー / チェックボックスで一括操作"
            : "行クリックでプレビュー / チェックボックスで一括操作 / 並び替えはカテゴリで絞り込み"}
        </p>
        <div className="overflow-hidden rounded-lg border bg-card">
          <div className="overflow-x-auto">
            {isSortable ? (
              <DndContext
                id="faq-item-sortable"
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={items.map((i) => i.id)}
                  strategy={verticalListSortingStrategy}
                >
                  {sortableTable}
                </SortableContext>
              </DndContext>
            ) : (
              staticTable
            )}
          </div>
        </div>
      </div>

      <FaqBulkActions
        selectedIds={selectedIds}
        categories={allCategories}
        onClear={() => setSelectedIds([])}
      />

      <FaqItemPreviewSheet
        item={previewItem}
        onClose={() => setPreviewItem(null)}
      />
    </>
  );
}
