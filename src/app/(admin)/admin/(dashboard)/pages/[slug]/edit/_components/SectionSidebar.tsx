"use client";

/**
 * セクションサイドバー（左パネル）
 *
 * DnDで順序変更可能なセクション一覧 + SEOリンク + セクション追加ボタン
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
import { Button, Separator } from "@/admin/components/ui";
import { Globe, Plus } from "lucide-react";
import type { PageSectionData } from "@/admin/actions/page-section";
import { SectionSidebarItem } from "./SectionSidebarItem";

const SEO_SELECTION_ID = "__seo__";

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

export { SEO_SELECTION_ID };

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
      {/* Section List */}
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
      <div className="border-t px-3 py-3 space-y-2">
        <Button
          onClick={onAddSection}
          disabled={disabled}
          className="w-full"
          size="sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          セクションを追加
        </Button>

        <Separator />

        <button
          type="button"
          onClick={() => onSelect(SEO_SELECTION_ID)}
          className={`flex items-center gap-2 w-full rounded-md px-3 py-2 text-sm transition-colors ${
            selectedId === SEO_SELECTION_ID
              ? "bg-accent/10 text-foreground font-medium"
              : "text-muted-foreground hover:text-foreground hover:bg-accent/5"
          }`}
        >
          <Globe className="h-4 w-4" />
          SEO設定
        </button>
      </div>
    </div>
  );
}
