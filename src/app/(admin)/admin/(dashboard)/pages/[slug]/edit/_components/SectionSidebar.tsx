"use client";

/**
 * セクションサイドバー（左パネル）
 *
 * DnDで順序変更可能なセクション一覧 + セクション追加ボタン
 */

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
import { SectionSidebarItem } from "./SectionSidebarItem";

interface SectionSidebarProps {
  sections: PageSectionData[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  onReorder: (sections: PageSectionData[]) => void;
  onToggle: (id: string, isActive: boolean) => void;
  onDuplicate: (id: string) => void;
  onDelete: (id: string) => void;
  onAddSection: () => void;
  disabled: boolean;
}

export function SectionSidebar({
  sections,
  selectedId,
  onSelect,
  onReorder,
  onToggle,
  onDuplicate,
  onDelete,
  onAddSection,
  disabled,
}: SectionSidebarProps) {
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
    <div className="flex flex-col h-full">
      {/* Section IconList */}
      <div className="flex-1 overflow-y-auto py-2">
        {sections.length > 0 ? (
          <DndContext
            id="section-sidebar-sortable"
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.map((s) => s.id)}
              strategy={verticalListSortingStrategy}
            >
              <div className="space-y-0.5 px-2">
                {sections.map((section) => (
                  <SectionSidebarItem
                    key={section.id}
                    section={section}
                    isSelected={selectedId === section.id}
                    onSelect={onSelect}
                    onToggle={onToggle}
                    onDuplicate={onDuplicate}
                    onDelete={onDelete}
                    disabled={disabled}
                  />
                ))}
              </div>
            </SortableContext>
          </DndContext>
        ) : (
          <div className="px-4 py-8 text-center">
            <p className="text-sm text-muted-foreground mb-3">
              セクションがありません
            </p>
          </div>
        )}
      </div>

      {/* Bottom Actions */}
      <div className="border-t px-3 py-3">
        <Button
          onClick={onAddSection}
          disabled={disabled}
          className="w-full"
          size="sm"
        >
          <IconPlus className="h-4 w-4 mr-2" />
          セクションを追加
        </Button>
      </div>
    </div>
  );
}
