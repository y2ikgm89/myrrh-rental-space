"use client";

import { cn } from "@/shared/lib/cn";
import { toTranslate3d, useSortable } from "@/admin/components/ui";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { Switch } from "@/admin/components/ui";
import {
  IconGripVertical,
  IconSearch,
  IconArticle,
  IconFlame,
  IconCategory,
  IconTag,
  IconApps,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type {
  CustomWidget,
  SidebarWidget,
} from "@/shared/lib/validations/sidebar";

// =============================================================================
// Constants
// =============================================================================

const WIDGET_LABELS: Record<string, string> = {
  search: "検索",
  recent: "新着記事",
  popular: "人気記事",
  categories: "カテゴリー",
  tags: "タグ",
};

const WIDGET_ICONS: Record<string, TablerIcon> = {
  search: IconSearch,
  recent: IconArticle,
  popular: IconFlame,
  categories: IconCategory,
  tags: IconTag,
};

// =============================================================================
// Helpers
// =============================================================================

export function getWidgetId(w: SidebarWidget): string {
  return w.type === "custom" ? w.id : w.type;
}

function getWidgetLabel(w: SidebarWidget): string {
  if (w.type === "custom") return w.title;
  return WIDGET_LABELS[w.type] ?? w.type;
}

// =============================================================================
// Props
// =============================================================================

export interface SidebarWidgetCardProps {
  widget: SidebarWidget;
  onToggle: (id: string, enabled: boolean) => void;
  onEdit: (widget: CustomWidget) => void;
  onDelete: (id: string, name: string) => void;
  disabled: boolean;
}

// =============================================================================
// Component
// =============================================================================

export function SidebarWidgetCard({
  widget,
  onToggle,
  onEdit,
  onDelete,
  disabled,
}: SidebarWidgetCardProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: getWidgetId(widget), disabled });

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const label = getWidgetLabel(widget);
  const widgetId = getWidgetId(widget);

  const Icon =
    widget.type === "custom"
      ? IconApps
      : (WIDGET_ICONS[widget.type] ?? IconApps);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "group flex items-center gap-3 rounded-md border p-3 transition-colors",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
        !widget.enabled && "opacity-60 bg-muted/30",
      )}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
        disabled={disabled}
        aria-label="ドラッグして並び替え"
      >
        <IconGripVertical className="h-4 w-4" />
      </button>

      {/* Icon */}
      <Icon className="h-4 w-4 text-muted-foreground shrink-0" />

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">{label}</p>
        {widget.type === "custom" && widget.description && (
          <p className="text-xs text-muted-foreground truncate">
            {widget.description}
          </p>
        )}
      </div>

      {/* Enabled switch */}
      <Switch
        checked={widget.enabled}
        onCheckedChange={(checked) => onToggle(widgetId, checked)}
        disabled={disabled}
      />

      {/* Action menu for custom widgets only */}
      {widget.type === "custom" && (
        <ActionDropdown disabled={disabled}>
          <ActionDropdownItem onClick={() => onEdit(widget)}>
            編集
          </ActionDropdownItem>
          <ActionDropdownSeparator />
          <ActionDropdownItem
            destructive
            onClick={() => onDelete(widgetId, label)}
          >
            削除
          </ActionDropdownItem>
        </ActionDropdown>
      )}
    </div>
  );
}
