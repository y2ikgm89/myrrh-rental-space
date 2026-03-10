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
import { DragHandle } from "@/admin/components/ui/sortable";
import { cn } from "@/shared/lib/cn";
import type { NavigationItemData, SocialLinkData } from "./types";
import { platformLabels } from "./types";

// =============================================================================
// Sortable Navigation Row
// =============================================================================

type SortableNavRowProps = {
  item: NavigationItemData;
  onEdit: (item: NavigationItemData) => void;
  onDelete: (id: string) => void;
  isPending: boolean;
  isChild?: boolean;
};

export function SortableNavRow({
  item,
  onEdit,
  onDelete,
  isPending,
  isChild,
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

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(
        isDragging && "z-50 bg-muted/80 shadow-lg",
        isChild && "bg-muted/30",
      )}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <TableCell className={cn("font-medium", isChild && "pl-8")}>
        {isChild && <span className="mr-2 text-muted-foreground">└</span>}
        {item.label}
      </TableCell>
      <TableCell className="text-muted-foreground">{item.url}</TableCell>
      <TableCell>
        {item.isExternal && <Badge variant="outline">外部</Badge>}
      </TableCell>
      <TableCell>
        <Badge variant={item.isActive ? "default" : "secondary"}>
          {item.isActive ? "有効" : "無効"}
        </Badge>
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(item)}
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
                <DialogTitle>メニューを削除しますか？</DialogTitle>
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
                    onDelete(item.id);
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

// =============================================================================
// Sortable Social Row
// =============================================================================

type SortableSocialRowProps = {
  link: SocialLinkData;
  onEdit: (link: SocialLinkData) => void;
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
