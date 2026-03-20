"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
  DndContext,
  closestCenter,
  SortableContext,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
} from "@/admin/components/ui";
import type { SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import type { NavigationType } from "@/shared/db/enums";
import type { Serialized } from "@/shared/lib/serialize";
import type {
  NavigationItemData,
  SocialLinkData,
  FlatNavigationItem,
} from "./types";
import { SortableNavRow, SortableSocialRow } from "./SortableNavItem";

// =============================================================================
// Navigation List Component
// =============================================================================

type NavigationListProps = {
  items: FlatNavigationItem[];
  type: NavigationType;
  emptyMessage: string;
  sensors: SensorDescriptor<SensorOptions>[];
  isPending: boolean;
  activeItemId: string | null;
  dragOffsetX: number;
  onAdd: (type: NavigationType) => void;
  onEdit: (item: NavigationItemData) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function NavigationList({
  items,
  type,
  emptyMessage,
  sensors,
  isPending,
  activeItemId,
  dragOffsetX,
  onAdd,
  onEdit,
  onDelete,
  onDragStart,
  onDragMove,
  onDragEnd,
}: NavigationListProps) {
  const title = {
    HEADER_DESKTOP: "デスクトップメニュー",
    HEADER_MOBILE: "モバイルメニュー",
    FOOTER: "フッターメニュー",
  }[type];

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>{title}</CardTitle>
        <Button size="sm" onClick={() => onAdd(type)}>
          追加
        </Button>
      </CardHeader>
      <CardContent>
        {items.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            {emptyMessage}
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              ドラッグ&ドロップで順序を変更できます。右にドラッグするとサブメニューになります。
            </p>
            <DndContext
              id={`nav-${type}-sortable`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead>ラベル</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="w-24">外部</TableHead>
                      <TableHead className="w-24">有効</TableHead>
                      <TableHead className="w-32">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {items.map((item) => (
                      <SortableNavRow
                        key={item.id}
                        item={item}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        isPending={isPending}
                        depth={item.depth}
                        isDragTarget={item.id === activeItemId}
                        dragOffsetX={dragOffsetX}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// =============================================================================
// Social Link List Component
// =============================================================================

type SocialLinkListProps = {
  links: Serialized<SocialLinkData>[];
  sensors: SensorDescriptor<SensorOptions>[];
  isPending: boolean;
  onAdd: () => void;
  onEdit: (link: Serialized<SocialLinkData>) => void;
  onDelete: (id: string) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function SocialLinkList({
  links,
  sensors,
  isPending,
  onAdd,
  onEdit,
  onDelete,
  onDragEnd,
}: SocialLinkListProps) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle>SNSリンク</CardTitle>
        <Button size="sm" onClick={onAdd}>
          追加
        </Button>
      </CardHeader>
      <CardContent>
        {links.length === 0 ? (
          <p className="py-4 text-center text-muted-foreground">
            SNSリンクがありません
          </p>
        ) : (
          <>
            <p className="mb-4 text-sm text-muted-foreground">
              ドラッグ&ドロップで順序を変更できます
            </p>
            <DndContext
              id="social-links-sortable"
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={links.map((link) => link.id)}
                strategy={verticalListSortingStrategy}
              >
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-12"></TableHead>
                      <TableHead className="w-32">プラットフォーム</TableHead>
                      <TableHead>URL</TableHead>
                      <TableHead className="w-24">PC</TableHead>
                      <TableHead className="w-24">モバイル</TableHead>
                      <TableHead className="w-24">有効</TableHead>
                      <TableHead className="w-32">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {links.map((link) => (
                      <SortableSocialRow
                        key={link.id}
                        link={link}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        isPending={isPending}
                      />
                    ))}
                  </TableBody>
                </Table>
              </SortableContext>
            </DndContext>
          </>
        )}
      </CardContent>
    </Card>
  );
}
