"use client";

import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  DndContext,
  DragOverlay,
  closestCenter,
  SortableContext,
  verticalListSortingStrategy,
  type DragEndEvent,
  type DragMoveEvent,
  type DragStartEvent,
  type DragOverEvent,
} from "@/admin/components/ui";
import type { SensorDescriptor, SensorOptions } from "@dnd-kit/core";
import type { NavigationType } from "@/shared/lib/validations/enums/prisma-types";
import type { Serialized } from "@/shared/lib/serialize";
import { DragHandle } from "@/admin/components/ui/sortable";
import { TokenLabel } from "@/shared/components/TokenLabel";
import type {
  NavigationItemData,
  SocialLinkData,
  FlatNavigationItem,
} from "./types";
import { platformLabels } from "./types";
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
  overItemId: string | null;
  dragOffsetX: number;
  onAdd: (type: NavigationType) => void;
  onEdit: (item: NavigationItemData) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragMove: (event: DragMoveEvent) => void;
  onDragOver: (event: DragOverEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
  onMakeChild: (id: string) => void;
  onMakeRoot: (id: string) => void;
};

export function NavigationList({
  items,
  type,
  emptyMessage,
  sensors,
  isPending,
  activeItemId,
  overItemId,
  dragOffsetX,
  onAdd,
  onEdit,
  onDelete,
  onDragStart,
  onDragMove,
  onDragOver,
  onDragEnd,
  onMakeChild,
  onMakeRoot,
}: NavigationListProps) {
  const title = {
    HEADER_DESKTOP: "デスクトップメニュー",
    HEADER_MOBILE: "モバイルメニュー",
    FOOTER: "フッターメニュー",
  }[type];

  // Find the active item for DragOverlay
  const activeItem = activeItemId
    ? items.find((item) => item.id === activeItemId)
    : null;

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
              ドラッグで並べ替え・右に移動でサブメニュー化
            </p>
            <DndContext
              id={`nav-${type}-sortable`}
              sensors={sensors}
              collisionDetection={closestCenter}
              onDragStart={onDragStart}
              onDragMove={onDragMove}
              onDragOver={onDragOver}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={items.map((item) => item.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {items.map((item, index) => {
                    // Determine if this item can be made a child:
                    // Must be root (depth 0) AND have a root item above it
                    const canMakeChild =
                      item.depth === 0 &&
                      items.slice(0, index).some((prev) => prev.depth === 0);

                    return (
                      <SortableNavRow
                        key={item.id}
                        item={item}
                        onEdit={onEdit}
                        onDelete={onDelete}
                        isPending={isPending}
                        depth={item.depth}
                        isDragTarget={item.id === activeItemId}
                        isDropTarget={
                          item.id === overItemId && item.id !== activeItemId
                        }
                        dragOffsetX={dragOffsetX}
                        canMakeChild={canMakeChild}
                        canMakeRoot={item.depth === 1}
                        onMakeChild={onMakeChild}
                        onMakeRoot={onMakeRoot}
                      />
                    );
                  })}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeItem ? (
                  <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 opacity-90 shadow-lg ring-2 ring-primary/20">
                    <DragHandle />
                    <span className="inline-flex items-center gap-1.5 text-sm font-medium">
                      <TokenLabel
                        tokens={activeItem.label}
                        iconClassName="h-4 w-4 shrink-0 text-muted-foreground"
                      />
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
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
  activeSocialId: string | null;
  onAdd: () => void;
  onEdit: (link: Serialized<SocialLinkData>) => void;
  onDelete: (id: string) => void;
  onDragStart: (event: DragStartEvent) => void;
  onDragEnd: (event: DragEndEvent) => void;
};

export function SocialLinkList({
  links,
  sensors,
  isPending,
  activeSocialId,
  onAdd,
  onEdit,
  onDelete,
  onDragStart,
  onDragEnd,
}: SocialLinkListProps) {
  const activeLink = activeSocialId
    ? links.find((l) => l.id === activeSocialId)
    : null;

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
              onDragStart={onDragStart}
              onDragEnd={onDragEnd}
            >
              <SortableContext
                items={links.map((link) => link.id)}
                strategy={verticalListSortingStrategy}
              >
                <div className="space-y-1">
                  {links.map((link) => (
                    <SortableSocialRow
                      key={link.id}
                      link={link}
                      onEdit={onEdit}
                      onDelete={onDelete}
                      isPending={isPending}
                    />
                  ))}
                </div>
              </SortableContext>
              <DragOverlay dropAnimation={null}>
                {activeLink ? (
                  <div className="flex items-center gap-2 rounded-md border bg-card px-3 py-2 opacity-90 shadow-lg ring-2 ring-primary/20">
                    <DragHandle />
                    <span className="text-sm font-medium">
                      {platformLabels[activeLink.platform]}
                    </span>
                  </div>
                ) : null}
              </DragOverlay>
            </DndContext>
          </>
        )}
      </CardContent>
    </Card>
  );
}
