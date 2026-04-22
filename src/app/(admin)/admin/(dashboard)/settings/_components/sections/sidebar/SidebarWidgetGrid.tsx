"use client";

import { DndContext, closestCenter } from "@dnd-kit/core";
import type { DragEndEvent } from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import type {
  CustomWidget,
  SidebarWidget,
} from "@/shared/lib/validations/sidebar";
import { SidebarWidgetCard, getWidgetId } from "./SidebarWidgetCard";

// =============================================================================
// Props
// =============================================================================

export interface SidebarWidgetGridProps {
  widgets: SidebarWidget[];
  onDragEnd: (event: DragEndEvent) => void;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (widget: CustomWidget) => void;
  onDelete: (id: string, name: string) => void;
  disabled: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function SidebarWidgetGrid({
  widgets,
  onDragEnd,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: SidebarWidgetGridProps) {
  return (
    <DndContext
      id="sidebar-widgets-sortable"
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={widgets.map(getWidgetId)}
        strategy={verticalListSortingStrategy}
      >
        <div className="space-y-2">
          {widgets.map((widget) => (
            <SidebarWidgetCard
              key={getWidgetId(widget)}
              widget={widget}
              onToggle={onToggle}
              onEdit={onEdit}
              onDelete={onDelete}
              disabled={disabled}
            />
          ))}
        </div>
      </SortableContext>
    </DndContext>
  );
}
