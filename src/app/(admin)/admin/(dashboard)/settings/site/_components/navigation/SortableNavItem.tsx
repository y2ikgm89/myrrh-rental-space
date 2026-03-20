"use client";

import { useState } from "react";
import {
  Button,
  TableCell,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Badge,
  useSortable,
  CSS,
} from "@/admin/components/ui";
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
import { platformLabels } from "./types";

// =============================================================================
// Indentation Constants (shared with NavigationManager)
// =============================================================================

const INDENT_WIDTH = 50;

function getProjectedDepth(offsetX: number, currentDepth: 0 | 1): 0 | 1 {
  const projectedPixels = currentDepth * INDENT_WIDTH + offsetX;
  const raw = Math.round(projectedPixels / INDENT_WIDTH);
  return Math.max(0, Math.min(1, raw)) === 1 ? 1 : 0;
}

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
  dragOffsetX: number;
};

export function SortableNavRow({
  item,
  onEdit,
  onDelete,
  isPending,
  depth,
  isDragTarget,
  dragOffsetX,
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
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  // During drag, show projected depth for the dragged item
  const displayDepth =
    isDragTarget && isDragging ? getProjectedDepth(dragOffsetX, depth) : depth;
  const isChild = displayDepth === 1;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex items-center gap-2 rounded-md border bg-card px-3 py-2",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
        !item.isActive && "opacity-50",
        isChild && "ml-8 border-l-2 border-l-primary/30",
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
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && "z-50 bg-muted/80 shadow-lg")}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <TableCell className="font-medium">
        {platformLabels[link.platform]}
      </TableCell>
      <TableCell className="text-muted-foreground truncate max-w-xs">
        {link.url}
      </TableCell>
      <TableCell>
        <Badge variant={link.showOnDesktop ? "default" : "secondary"}>
          {link.showOnDesktop ? "表示" : "非表示"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={link.showOnMobile ? "default" : "secondary"}>
          {link.showOnMobile ? "表示" : "非表示"}
        </Badge>
      </TableCell>
      <TableCell>
        <Badge variant={link.isActive ? "default" : "secondary"}>
          {link.isActive ? "有効" : "無効"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(link)}
            disabled={isPending}
          >
            編集
          </Button>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="destructive" size="sm" disabled={isPending}>
                削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>SNSリンクを削除しますか？</DialogTitle>
                <DialogDescription>
                  この操作は取り消せません。
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete(link.id);
                    setDeleteDialogOpen(false);
                  }}
                  disabled={isPending}
                >
                  削除する
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  );
}
