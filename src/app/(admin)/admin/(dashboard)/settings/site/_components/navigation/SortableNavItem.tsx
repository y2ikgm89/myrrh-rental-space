"use client";

import { useState } from "react";
import { Badge, useSortable } from "@/admin/components/ui";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { DragHandle } from "@/admin/components/ui/sortable";
import { cn } from "@/shared/lib/cn";
import type { Serialized } from "@/shared/lib/serialize";
import type { NavigationItemData, SocialLinkData } from "./types";
import { getProjectedDepth, platformLabels } from "./types";

// =============================================================================
// Sortable Navigation Row (Card-based)
// =============================================================================

type SortableNavRowProps = {
  item: NavigationItemData;
  onEdit: (item: NavigationItemData) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  depth: 0 | 1;
  isDragTarget: boolean;
  isDropTarget: boolean;
  dragOffsetX: number;
  canMakeChild: boolean;
  canMakeRoot: boolean;
  onMakeChild: (id: string) => void;
  onMakeRoot: (id: string) => void;
};

export function SortableNavRow({
  item,
  onEdit,
  onDelete,
  isPending,
  depth,
  isDragTarget,
  isDropTarget,
  dragOffsetX,
  canMakeChild,
  canMakeRoot,
  onMakeChild,
  onMakeRoot,
}: SortableNavRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: item.id });

  // Translate only -- suppress scale to prevent layout shift
  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // During drag, show projected depth for the dragged item
  const displayDepth =
    isDragTarget && isDragging ? getProjectedDepth(dragOffsetX, depth) : depth;
  const isChild = displayDepth === 1;

  // Compute projected drop depth for the drop indicator
  const projectedDropDepth =
    isDragTarget && isDragging ? getProjectedDepth(dragOffsetX, depth) : depth;

  return (
    <>
      {/* Drop indicator line */}
      {isDropTarget && !isDragging && (
        <div
          className="h-0.5 rounded-full bg-primary"
          style={{ marginLeft: projectedDropDepth === 1 ? 32 : 0 }}
        />
      )}
      <div
        ref={setNodeRef}
        style={{
          ...style,
          // Use padding instead of margin for indent -- prevents layout shift
          paddingLeft: isChild ? 32 : undefined,
        }}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
          isDragging && "opacity-30",
          !item.isActive && "opacity-50",
          isChild && "border-l-2 border-l-primary/30",
        )}
      >
        <div className="shrink-0 cursor-grab" {...attributes} {...listeners}>
          <DragHandle />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="truncate text-sm font-medium">{item.label}</span>
          <span className="hidden truncate text-xs text-muted-foreground sm:inline">
            {item.url}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {item.isExternal && (
            <Badge variant="outline" className="text-xs">
              外部
            </Badge>
          )}
          {!item.isActive && (
            <Badge variant="secondary" className="text-xs">
              無効
            </Badge>
          )}
        </div>
        <ActionDropdown disabled={isPending}>
          <ActionDropdownItem onClick={() => onEdit(item)}>
            編集
          </ActionDropdownItem>
          {canMakeChild && (
            <ActionDropdownItem onClick={() => onMakeChild(item.id)}>
              サブメニュー化
            </ActionDropdownItem>
          )}
          {canMakeRoot && (
            <ActionDropdownItem onClick={() => onMakeRoot(item.id)}>
              トップレベルに移動
            </ActionDropdownItem>
          )}
          <ActionDropdownSeparator />
          <ActionDropdownItem
            destructive
            onClick={() => setDeleteDialogOpen(true)}
          >
            削除
          </ActionDropdownItem>
        </ActionDropdown>
        <DeleteConfirmDialog
          open={deleteDialogOpen}
          onOpenChange={setDeleteDialogOpen}
          itemName={item.label}
          onConfirm={() => onDelete(item.id)}
          isPending={isPending}
        />
      </div>
    </>
  );
}

// =============================================================================
// Sortable Social Row
// =============================================================================

type SortableSocialRowProps = {
  link: Serialized<SocialLinkData>;
  onEdit: (link: Serialized<SocialLinkData>) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
};

export function SortableSocialRow({
  link,
  onEdit,
  onDelete,
  isPending,
}: SortableSocialRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: link.id });

  const style = {
    transform: transform
      ? `translate3d(${Math.round(transform.x)}px, ${Math.round(transform.y)}px, 0)`
      : undefined,
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
        !link.isActive && "opacity-50",
      )}
    >
      <div className="shrink-0 cursor-grab" {...attributes} {...listeners}>
        <DragHandle />
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate text-sm font-medium">
          {platformLabels[link.platform]}
        </span>
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          {link.url}
        </span>
      </div>
      <div className="flex shrink-0 items-center gap-1">
        {!link.showOnDesktop && (
          <Badge variant="secondary" className="text-xs">
            PC非表示
          </Badge>
        )}
        {!link.showOnMobile && (
          <Badge variant="secondary" className="text-xs">
            モバイル非表示
          </Badge>
        )}
        {!link.isActive && (
          <Badge variant="secondary" className="text-xs">
            無効
          </Badge>
        )}
      </div>
      <ActionDropdown disabled={isPending}>
        <ActionDropdownItem onClick={() => onEdit(link)}>
          編集
        </ActionDropdownItem>
        <ActionDropdownSeparator />
        <ActionDropdownItem
          destructive
          onClick={() => setDeleteDialogOpen(true)}
        >
          削除
        </ActionDropdownItem>
      </ActionDropdown>
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={platformLabels[link.platform]}
        onConfirm={() => onDelete(link.id)}
        isPending={isPending}
      />
    </div>
  );
}
