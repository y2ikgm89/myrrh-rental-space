"use client";

/**
 * セクションリスト（左パネル）
 *
 * DnDで順序変更可能なセクション一覧 + セクション挿入ボタン + セクション追加ボタン
 */

import { Fragment } from "react";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Button } from "@/admin/components/ui";
import { IconPlus } from "@tabler/icons-react";
import type { PageSectionData } from "@/admin/actions/page-section";
import { SectionListItem } from "./SectionListItem";
import { SectionInserter } from "./SectionInserter";

interface SectionListProps {
  sections: PageSectionData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (sections: PageSectionData[]) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSection: (insertIndex?: number) => void;
  disabled: boolean;
}

export function SectionList({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onToggle,
  onDuplicate,
  onDelete,
  onAddSection,
  disabled,
}: SectionListProps) {
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;

    const oldIndex = sections.findIndex((s) => s.id === active.id);
    const newIndex = sections.findIndex((s) => s.id === over.id);
    const reordered = arrayMove(sections, oldIndex, newIndex);
    onReorder(reordered);
  }

  return (
    <div className="flex flex-col h-full bg-muted/30">
      {/* ヘッダー */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2.5 border-b border-border bg-card">
        <span className="text-xs font-semibold text-foreground">
          セクション
        </span>
        <span className="text-[10px] tabular-nums text-muted-foreground bg-muted rounded px-1.5 py-0.5">
          {sections.length}
        </span>
      </div>

      {/* セクション一覧 */}
      <div className="flex-1 overflow-y-auto px-1.5 py-1.5">
        {sections.length > 0 ? (
          <DndContext
            id="section-list-sortable"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              {sections.map((section, index) => (
                <Fragment key={section.id}>
                  {index === 0 && (
                    <SectionInserter
                      onInsert={() => onAddSection(0)}
                      disabled={disabled}
                    />
                  )}
                  <SectionListItem
                    section={section}
                    index={index}
                    isSelected={selectedId === section.id}
                    isLast={index === sections.length - 1}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    disabled={disabled}
                  />
                  <SectionInserter
                    onInsert={() => onAddSection(index + 1)}
                    disabled={disabled}
                  />
                </Fragment>
              ))}
            </SortableContext>
          </DndContext>
        ) : (
          <p className="px-2 py-8 text-center text-xs text-muted-foreground">
            セクションがありません
          </p>
        )}
      </div>

      {/* 追加ボタン */}
      <div className="shrink-0 border-t border-border px-3 py-2.5 bg-card">
        <Button
          onClick={() => onAddSection()}
          disabled={disabled}
          variant="default"
          className="w-full"
          size="sm"
        >
          <IconPlus className="h-3.5 w-3.5 mr-1.5" />
          セクションを追加
        </Button>
      </div>
    </div>
  );
}
