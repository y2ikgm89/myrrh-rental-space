/**
 * Draggable Block Plugin
 *
 * @description ブロックのドラッグ＆ドロップ並べ替えを提供するプラグイン
 *
 * `lexical-draggable-block-plugin`（Lexical 0.41 フォーク）の DraggableBlockPlugin_EXPERIMENTAL をラップ
 */

"use client";

import { useState, useRef } from "react";
import type { RefObject } from "react";
import { createPortal } from "react-dom";
import { DraggableBlockPlugin_EXPERIMENTAL } from "./lexical-draggable-block-plugin";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import {
  $getNearestNodeFromDOMNode,
  $getNodeByKey,
  $parseSerializedNode,
} from "lexical";
import { GripVertical } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/admin/components/ui/dropdown-menu";

// =============================================================================
// Types
// =============================================================================

type DraggableBlockPluginProps = {
  anchorElem: HTMLElement | null;
};

type MenuState = {
  x: number;
  y: number;
  nodeKey: string;
};

// =============================================================================
// Drag Handle Component
// =============================================================================

function DragHandle({
  menuRef,
  onMenuOpen,
}: {
  menuRef: RefObject<HTMLDivElement | null>;
  onMenuOpen: (e: React.MouseEvent) => void;
}) {
  return (
    <div
      ref={menuRef}
      className="draggable-block-menu absolute left-0 top-0 flex size-8 cursor-grab items-center justify-center rounded p-0.5 opacity-0 transition-opacity hover:bg-muted active:cursor-grabbing"
      onClick={onMenuOpen}
    >
      <GripVertical className="h-4 w-4 text-muted-foreground" />
    </div>
  );
}

// =============================================================================
// Target Line Component
// =============================================================================

function TargetLine({
  targetLineRef,
}: {
  targetLineRef: RefObject<HTMLDivElement | null>;
}) {
  return (
    <div
      ref={targetLineRef}
      className="draggable-block-target-line pointer-events-none absolute left-0 top-0 h-1 rounded-sm bg-primary opacity-0"
    />
  );
}

// =============================================================================
// Main Plugin
// =============================================================================

export function DraggableBlockPlugin({
  anchorElem,
}: DraggableBlockPluginProps) {
  const [editor] = useLexicalComposerContext();
  const menuRef = useRef<HTMLDivElement>(null);
  const targetLineRef = useRef<HTMLDivElement>(null);
  const currentBlockElemRef = useRef<HTMLElement | null>(null);
  const [menu, setMenu] = useState<MenuState | null>(null);

  if (!anchorElem) {
    return null;
  }

  const handleMenuOpen = (e: React.MouseEvent) => {
    e.stopPropagation();
    const blockElem = currentBlockElemRef.current;
    if (!blockElem) return;
    editor.getEditorState().read(() => {
      const node = $getNearestNodeFromDOMNode(blockElem);
      if (!node) return;
      setMenu({ x: e.clientX, y: e.clientY, nodeKey: node.getKey() });
    });
  };

  const handleMoveUp = () => {
    const blockElem = currentBlockElemRef.current;
    if (!blockElem) return;
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(blockElem);
      if (!node) return;
      const prev = node.getPreviousSibling();
      if (prev) prev.insertBefore(node);
    });
  };

  const handleMoveDown = () => {
    const blockElem = currentBlockElemRef.current;
    if (!blockElem) return;
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(blockElem);
      if (!node) return;
      const next = node.getNextSibling();
      if (next) next.insertAfter(node);
    });
  };

  const handleDuplicate = () => {
    if (!menu) return;
    editor.update(() => {
      const node = $getNodeByKey(menu.nodeKey);
      if (!node) return;
      const serialized = node.exportJSON();
      const parsed = $parseSerializedNode(serialized);
      node.insertAfter(parsed);
    });
    setMenu(null);
  };

  const handleDelete = () => {
    if (!menu) return;
    editor.update(() => {
      $getNodeByKey(menu.nodeKey)?.remove();
    });
    setMenu(null);
  };

  return createPortal(
    <>
      <DraggableBlockPlugin_EXPERIMENTAL
        anchorElem={anchorElem}
        menuRef={menuRef}
        targetLineRef={targetLineRef}
        menuComponent={
          <DragHandle menuRef={menuRef} onMenuOpen={handleMenuOpen} />
        }
        targetLineComponent={<TargetLine targetLineRef={targetLineRef} />}
        isOnMenu={(element: HTMLElement) =>
          element.closest(".draggable-block-menu") !== null
        }
        onElementChanged={(element: HTMLElement | null) => {
          currentBlockElemRef.current = element;
        }}
      />
      {menu && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setMenu(null);
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              style={{
                position: "fixed",
                left: menu.x,
                top: menu.y,
                width: 1,
                height: 1,
                pointerEvents: "none",
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
            <DropdownMenuItem
              onClick={() => {
                handleMoveUp();
                setMenu(null);
              }}
            >
              上に移動
            </DropdownMenuItem>
            <DropdownMenuItem
              onClick={() => {
                handleMoveDown();
                setMenu(null);
              }}
            >
              下に移動
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleDuplicate}>複製</DropdownMenuItem>
            <DropdownMenuItem
              className="text-destructive focus:text-destructive"
              onClick={handleDelete}
            >
              削除
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      )}
    </>,
    anchorElem,
  );
}
