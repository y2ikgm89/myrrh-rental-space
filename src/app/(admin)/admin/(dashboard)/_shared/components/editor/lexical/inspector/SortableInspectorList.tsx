/**
 * Sortable Inspector List
 *
 * @description DnD対応のインスペクターパネル用アイテムリスト
 * Tabs / Steps / Collapsible のインスペクターパネルで共通使用
 */

"use client";

import { GripVertical, Plus, Trash2 } from "lucide-react";
import {
  DndContext,
  closestCenter,
  useSensors,
  useSensor,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
  useSortable,
  toTranslate3d,
  type DragEndEvent,
} from "@/admin/components/ui/sortable";
import { cn } from "@/shared/lib/cn";

// =============================================================================
// Types
// =============================================================================

export type SortableInspectorItem = {
  id: string;
  label: string;
  isActive?: boolean;
};

type SortableInspectorListProps = {
  items: SortableInspectorItem[];
  onReorder: (fromIndex: number, toIndex: number) => void;
  onRemove: (id: string) => void;
  onAdd: () => void;
  canAdd: boolean;
  canRemove: boolean;
  addLabel: string;
  maxMessage?: string;
  minMessage?: string;
};

// =============================================================================
// Sortable List Item
// =============================================================================

function SortableListItem({
  item,
  position,
  canRemove,
  onRemove,
  minMessage,
}: {
  item: SortableInspectorItem;
  position: number;
  canRemove: boolean;
  onRemove: (id: string) => void;
  minMessage?: string;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group/item flex items-center gap-1 rounded-md border px-1.5 h-9",
        item.isActive ? "border-primary/30 bg-primary/5" : "border-border",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
      {...attributes}
    >
      <button
        type="button"
        className="shrink-0 cursor-grab rounded p-0.5 text-muted-foreground hover:text-foreground active:cursor-grabbing"
        aria-label="ドラッグして並び替え"
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <span
        className={cn(
          "shrink-0 w-4 text-xs font-mono",
          item.isActive ? "text-primary" : "text-muted-foreground",
        )}
      >
        {position}
      </span>
      <span className="min-w-0 flex-1 truncate text-xs" title={item.label}>
        {item.label || "(未入力)"}
      </span>
      <button
        type="button"
        onClick={() => onRemove(item.id)}
        disabled={!canRemove}
        className="shrink-0 rounded p-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-destructive/10 hover:text-destructive disabled:opacity-0 disabled:pointer-events-none"
        title={canRemove ? `${position} を削除` : minMessage}
      >
        <Trash2 className="h-3.5 w-3.5" />
      </button>
    </div>
  );
}

// =============================================================================
// Sortable Inspector List
// =============================================================================

export function SortableInspectorList({
  items,
  onReorder,
  onRemove,
  onAdd,
  canAdd,
  canRemove,
  addLabel,
  maxMessage,
  minMessage,
}: SortableInspectorListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: { distance: 4 },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const fromIndex = items.findIndex((item) => item.id === String(active.id));
    const toIndex = items.findIndex((item) => item.id === String(over.id));
    if (fromIndex === -1 || toIndex === -1) return;

    onReorder(fromIndex, toIndex);
  };

  return (
    <>
      <DndContext
        id="inspector-sortable"
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={items.map((item) => item.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1.5">
            {items.map((item, i) => (
              <SortableListItem
                key={item.id}
                item={item}
                position={i + 1}
                canRemove={canRemove}
                onRemove={onRemove}
                {...(minMessage !== undefined && { minMessage })}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      <button
        type="button"
        onClick={onAdd}
        disabled={!canAdd}
        className="flex w-full items-center justify-center gap-1.5 rounded-md border border-dashed border-border h-9 text-xs text-muted-foreground transition-colors hover:border-foreground/30 hover:text-foreground disabled:opacity-30 disabled:pointer-events-none"
        title={canAdd ? undefined : maxMessage}
      >
        <Plus className="h-3.5 w-3.5" />
        {addLabel}
      </button>
    </>
  );
}
