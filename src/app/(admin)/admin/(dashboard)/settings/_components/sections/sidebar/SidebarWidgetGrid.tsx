"use client";

import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  SortableContext,
  closestCenter,
  sortableKeyboardCoordinates,
  useSensor,
  useSensors,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@/admin/components/ui";
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
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  return (
    <DndContext
      id="sidebar-widgets-sortable"
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={onDragEnd}
    >
      <SortableContext
        items={widgets.map(getWidgetId)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
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
