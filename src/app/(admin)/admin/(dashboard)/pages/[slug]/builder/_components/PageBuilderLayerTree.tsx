"use client";

import {
  useId,
  type ComponentProps,
  type CSSProperties,
  type ReactElement,
} from "react";
import {
  IconEye,
  IconEyeOff,
  IconGripVertical,
  IconLock,
} from "@tabler/icons-react";
import { Badge } from "@/admin/components/ui";
import {
  DndContext,
  KeyboardSensor,
  PointerSensor,
  SortableContext,
  closestCenter,
  sortableKeyboardCoordinates,
  toTranslate3d,
  useSensor,
  useSensors,
  useSortable,
  verticalListSortingStrategy,
  type DragEndEvent,
} from "@/admin/components/ui/sortable";
import { cn } from "@/shared/lib/cn";
import {
  hasPageBuilderNodeVisibilityOverride,
  resolvePageBuilderNodeHidden,
} from "@/shared/lib/page-builder/visibility";
import type {
  PageBuilderBreakpoint,
  PageBuilderDocument,
  PageBuilderNode,
} from "@/shared/lib/page-builder/schema";
import type { FreeformPageBuilderNodeSelectOptions } from "@/shared/page-builder/renderer/FreeformPageRenderer";

type PageBuilderLayerTreeProps = {
  document: PageBuilderDocument;
  breakpoint: PageBuilderBreakpoint;
  selectedNodeId: string;
  selectedNodeIds: readonly string[];
  onSelectNode: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onReorderNode: (activeNodeId: string, overNodeId: string) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  disabled: boolean;
};

type LayerTreeNodeProps = {
  document: PageBuilderDocument;
  breakpoint: PageBuilderBreakpoint;
  nodeId: string;
  depth: number;
  selectedNodeId: string;
  selectedNodeIds: readonly string[];
  onSelectNode: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  disabled: boolean;
};

type SortableLayerRowProps = {
  node: PageBuilderNode;
  breakpoint: PageBuilderBreakpoint;
  depth: number;
  isSelected: boolean;
  onSelectNode: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  disabled: boolean;
};

type LayerRowContentProps = {
  node: PageBuilderNode;
  depth: number;
  isHidden: boolean;
  hasVisibilityOverride: boolean;
  isSelected: boolean;
  onSelectNode: (
    nodeId: string,
    options?: FreeformPageBuilderNodeSelectOptions,
  ) => void;
  onToggleNodeHidden: (nodeId: string) => void;
  onToggleNodeLocked: (nodeId: string) => void;
  isDragging: boolean;
  dragDisabled: boolean;
  dragHandleProps?: ComponentProps<"button">;
  rootRef?: ((element: HTMLDivElement | null) => void) | null;
  style?: CSSProperties;
};

function getNodeTypeLabel(node: PageBuilderNode): string {
  if (node.type === "root") return "Root";
  if (node.type === "frame") return "Frame";
  if (node.type === "stack") return "Stack";
  if (node.type === "grid") return "Grid";
  if (node.type === "text") return "Text";
  if (node.type === "image") return "Image";
  if (node.type === "button") return "Button";
  if (node.type === "divider") return "Divider";
  if (node.type === "spacer") return "Spacer";
  if (node.type === "embed") return "Embed";
  return "Form";
}

function LayerRowContent({
  node,
  depth,
  isHidden,
  hasVisibilityOverride,
  isSelected,
  onSelectNode,
  onToggleNodeHidden,
  onToggleNodeLocked,
  isDragging,
  dragDisabled,
  dragHandleProps,
  rootRef,
  style,
}: LayerRowContentProps): ReactElement {
  const toggleDisabled = dragDisabled || node.parentId === null;

  return (
    <div
      ref={rootRef}
      style={style}
      className={cn(
        "group flex items-center gap-2 rounded-lg border px-2 py-2 transition-colors",
        isSelected
          ? "border-primary bg-primary/5 text-foreground"
          : "border-transparent bg-background hover:border-border hover:bg-muted/40",
        isDragging && "z-50 shadow-lg ring-2 ring-primary/20",
      )}
    >
      <button
        type="button"
        className="min-w-0 flex-1 text-left"
        style={{ paddingLeft: `${depth * 16 + 4}px` }}
        onClick={(event) =>
          onSelectNode(node.id, {
            additive: event.metaKey || event.ctrlKey || event.shiftKey,
          })
        }
      >
        <span className="block truncate text-sm font-medium">{node.name}</span>
        <span className="block text-xs text-muted-foreground">
          {getNodeTypeLabel(node)}
        </span>
      </button>

      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            isHidden
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            hasVisibilityOverride && "ring-1 ring-primary/30 ring-inset",
            toggleDisabled && "cursor-not-allowed opacity-40",
          )}
          aria-label={isHidden ? "表示する" : "非表示にする"}
          disabled={toggleDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggleNodeHidden(node.id);
          }}
        >
          {isHidden ? (
            <IconEyeOff className="h-3.5 w-3.5" />
          ) : (
            <IconEye className="h-3.5 w-3.5" />
          )}
        </button>
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            node.locked
              ? "bg-muted text-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
            toggleDisabled && "cursor-not-allowed opacity-40",
          )}
          aria-label={node.locked ? "ロックを解除する" : "ロックする"}
          disabled={toggleDisabled}
          onClick={(event) => {
            event.stopPropagation();
            onToggleNodeLocked(node.id);
          }}
        >
          <IconLock className="h-3.5 w-3.5" />
        </button>
        {node.children.length > 0 ? (
          <Badge variant="secondary">{node.children.length}</Badge>
        ) : null}
        <button
          type="button"
          className={cn(
            "flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors",
            dragDisabled
              ? "cursor-not-allowed opacity-40"
              : "cursor-grab touch-none hover:bg-muted hover:text-foreground active:cursor-grabbing",
          )}
          aria-label="ドラッグして並び替え"
          disabled={dragDisabled}
          onClick={(event) => event.stopPropagation()}
          {...dragHandleProps}
        >
          <IconGripVertical className="h-4 w-4" />
        </button>
      </div>
    </div>
  );
}

function StaticLayerRow({
  node,
  breakpoint,
  depth,
  isSelected,
  onSelectNode,
  onToggleNodeHidden,
  onToggleNodeLocked,
}: Omit<SortableLayerRowProps, "disabled">): ReactElement {
  return (
    <LayerRowContent
      node={node}
      isHidden={resolvePageBuilderNodeHidden(node, breakpoint)}
      hasVisibilityOverride={hasPageBuilderNodeVisibilityOverride(
        node,
        breakpoint,
      )}
      depth={depth}
      isSelected={isSelected}
      onSelectNode={onSelectNode}
      onToggleNodeHidden={onToggleNodeHidden}
      onToggleNodeLocked={onToggleNodeLocked}
      isDragging={false}
      dragDisabled
    />
  );
}

function SortableLayerRow({
  node,
  breakpoint,
  depth,
  isSelected,
  onSelectNode,
  onToggleNodeHidden,
  onToggleNodeLocked,
  disabled,
}: SortableLayerRowProps): ReactElement {
  const dragDisabled = disabled || node.parentId === null || node.locked;
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: node.id,
    disabled: dragDisabled,
  });

  const style: CSSProperties = {
    transform: toTranslate3d(transform),
    transition,
  };

  return (
    <LayerRowContent
      node={node}
      isHidden={resolvePageBuilderNodeHidden(node, breakpoint)}
      hasVisibilityOverride={hasPageBuilderNodeVisibilityOverride(
        node,
        breakpoint,
      )}
      depth={depth}
      isSelected={isSelected}
      onSelectNode={onSelectNode}
      onToggleNodeHidden={onToggleNodeHidden}
      onToggleNodeLocked={onToggleNodeLocked}
      isDragging={isDragging}
      dragDisabled={dragDisabled}
      dragHandleProps={{ ...attributes, ...listeners }}
      rootRef={setNodeRef}
      style={style}
    />
  );
}

function LayerTreeNode({
  document,
  breakpoint,
  nodeId,
  depth,
  selectedNodeId,
  selectedNodeIds,
  onSelectNode,
  onToggleNodeHidden,
  onToggleNodeLocked,
  disabled,
}: LayerTreeNodeProps): ReactElement | null {
  const node = document.nodes[nodeId];
  if (!node) {
    return null;
  }

  return (
    <div className="space-y-1">
      {node.parentId === null ? (
        <StaticLayerRow
          node={node}
          breakpoint={breakpoint}
          depth={depth}
          isSelected={selectedNodeIds.includes(node.id)}
          onSelectNode={onSelectNode}
          onToggleNodeHidden={onToggleNodeHidden}
          onToggleNodeLocked={onToggleNodeLocked}
        />
      ) : (
        <SortableLayerRow
          node={node}
          breakpoint={breakpoint}
          depth={depth}
          isSelected={selectedNodeIds.includes(node.id)}
          onSelectNode={onSelectNode}
          onToggleNodeHidden={onToggleNodeHidden}
          onToggleNodeLocked={onToggleNodeLocked}
          disabled={disabled}
        />
      )}

      {node.children.length > 0 ? (
        <SortableContext
          items={node.children}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-1">
            {node.children.map((childId) => (
              <LayerTreeNode
                key={childId}
                document={document}
                breakpoint={breakpoint}
                nodeId={childId}
                depth={depth + 1}
                selectedNodeId={selectedNodeId}
                selectedNodeIds={selectedNodeIds}
                onSelectNode={onSelectNode}
                onToggleNodeHidden={onToggleNodeHidden}
                onToggleNodeLocked={onToggleNodeLocked}
                disabled={disabled}
              />
            ))}
          </div>
        </SortableContext>
      ) : null}
    </div>
  );
}

export function PageBuilderLayerTree({
  document,
  breakpoint,
  selectedNodeId,
  selectedNodeIds,
  onSelectNode,
  onReorderNode,
  onToggleNodeHidden,
  onToggleNodeLocked,
  disabled,
}: PageBuilderLayerTreeProps): ReactElement {
  const dndId = useId();
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );

  function handleDragEnd(event: DragEndEvent): void {
    const { active, over } = event;
    if (!over || active.id === over.id) {
      return;
    }

    onReorderNode(String(active.id), String(over.id));
  }

  return (
    <DndContext
      id={dndId}
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <LayerTreeNode
        document={document}
        breakpoint={breakpoint}
        nodeId={document.rootId}
        depth={0}
        selectedNodeId={selectedNodeId}
        selectedNodeIds={selectedNodeIds}
        onSelectNode={onSelectNode}
        onToggleNodeHidden={onToggleNodeHidden}
        onToggleNodeLocked={onToggleNodeLocked}
        disabled={disabled}
      />
    </DndContext>
  );
}
