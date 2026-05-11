"use client";

import { useState } from "react";
import { Badge, useSortable, toTranslate3d } from "@/admin/components/ui";
import {
  ActionDropdown,
  ActionDropdownItem,
  ActionDropdownSeparator,
} from "@/admin/components/ActionDropdown";
import { DeleteConfirmDialog } from "@/admin/components/DeleteConfirmDialog";
import { DragHandle } from "@/admin/components/ui/sortable";
import { cn } from "@/shared/lib/cn";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { spansToPlainText } from "@/shared/lib/portable-text";
import type { Serialized } from "@/shared/lib/serialize";
import { IconExternalLink } from "@tabler/icons-react";
import type { NavigationItemData, SocialLinkData } from "./types";
import { getProjectedDepth, platformLabels, platformIcons } from "./types";

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

  const style = {
    transform: toTranslate3d(transform),
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  const displayDepth =
    isDragTarget && isDragging ? getProjectedDepth(dragOffsetX, depth) : depth;
  const isChild = displayDepth === 1;

  return (
    <>
      {/* Drop indicator line */}
      {isDropTarget && !isDragging && (
        <div
          className="h-0.5 rounded-full bg-primary"
          style={{ marginLeft: displayDepth === 1 ? 32 : 0 }}
        />
      )}
      <div
        ref={setNodeRef}
        style={{
          ...style,
          paddingLeft: isChild ? 32 : undefined,
        }}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
          isDragging && "opacity-30",
          !item.isActive && "opacity-50",
          isChild && "border-l-2 border-l-primary/30",
        )}
      >
        <div
          className={cn(
            "shrink-0",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          {...attributes}
          {...listeners}
        >
          <DragHandle />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <span className="inline-flex min-w-0 items-center gap-1.5 truncate text-sm font-medium">
            <PortableTextSpans
              spans={item.label}
              iconClassName="h-4 w-4 shrink-0 text-muted-foreground"
            />
          </span>
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
      </div>
      {/* Dialog outside sortable div to prevent DnD clone conflicts */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={spansToPlainText(item.label) || "メニュー"}
        onConfirm={() => onDelete(item.id)}
        isPending={isPending}
      />
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
    transform: toTranslate3d(transform),
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const PlatformIcon = platformIcons[link.platform] ?? IconExternalLink;

  return (
    <>
      <div
        ref={setNodeRef}
        style={style}
        className={cn(
          "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
          isDragging && "opacity-30",
          !link.isActive && "opacity-50",
        )}
      >
        <div
          className={cn(
            "shrink-0",
            isDragging ? "cursor-grabbing" : "cursor-grab",
          )}
          {...attributes}
          {...listeners}
        >
          <DragHandle />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2">
          <PlatformIcon className="h-4 w-4 shrink-0 text-muted-foreground" />
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
      </div>
      {/* Dialog outside sortable div to prevent DnD clone conflicts */}
      <DeleteConfirmDialog
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        itemName={platformLabels[link.platform]}
        onConfirm={() => onDelete(link.id)}
        isPending={isPending}
      />
    </>
  );
}
