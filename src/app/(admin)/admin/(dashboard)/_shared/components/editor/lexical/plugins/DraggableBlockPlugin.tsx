/**
 * Draggable Block Plugin
 *
 * @description ブロックのドラッグ＆ドロップ並べ替えを提供するプラグイン
 *
 * @lexical/react の DraggableBlockPlugin_EXPERIMENTAL をラップ
 */

'use client'

import { useState, useRef } from 'react'
import type { RefObject } from 'react'
import { createPortal } from 'react-dom'
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin'
import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext'
import { $getNearestNodeFromDOMNode, $getNodeByKey, $parseSerializedNode } from 'lexical'
import { ChevronDown, ChevronUp, GripVertical } from 'lucide-react'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/admin/components/ui/dropdown-menu'

// =============================================================================
// Types
// =============================================================================

type DraggableBlockPluginProps = {
  anchorElem: HTMLElement | null
}

type ContextMenuState = {
  x: number
  y: number
  nodeKey: string
}

// =============================================================================
// Drag Handle Component
// =============================================================================

function DragHandle({
  menuRef,
  onContextMenu,
  onMoveUp,
  onMoveDown,
}: {
  menuRef: RefObject<HTMLDivElement | null>
  onContextMenu: (e: React.MouseEvent) => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  return (
    <div
      ref={menuRef}
      className="draggable-block-menu absolute left-1 top-0 flex flex-col items-center cursor-grab rounded p-0.5 opacity-0 transition-opacity hover:bg-muted active:cursor-grabbing"
      onContextMenu={onContextMenu}
    >
      <button
        type="button"
        className="p-0.5 text-muted-foreground hover:text-foreground rounded"
        onClick={(e) => {
          e.stopPropagation()
          onMoveUp()
        }}
        aria-label="上に移動"
      >
        <ChevronUp className="h-3.5 w-3.5" />
      </button>
      <GripVertical className="h-4 w-4 text-muted-foreground" />
      <button
        type="button"
        className="p-0.5 text-muted-foreground hover:text-foreground rounded"
        onClick={(e) => {
          e.stopPropagation()
          onMoveDown()
        }}
        aria-label="下に移動"
      >
        <ChevronDown className="h-3.5 w-3.5" />
      </button>
    </div>
  )
}

// =============================================================================
// Target Line Component
// =============================================================================

function TargetLine({
  targetLineRef,
}: {
  targetLineRef: RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={targetLineRef}
      className="draggable-block-target-line pointer-events-none absolute left-6 top-0 h-1 rounded-sm bg-primary opacity-0"
      style={{ width: 'calc(100% - 1.5rem)' }}
    />
  )
}

// =============================================================================
// Main Plugin
// =============================================================================

export function DraggableBlockPlugin({ anchorElem }: DraggableBlockPluginProps) {
  const [editor] = useLexicalComposerContext()
  const menuRef = useRef<HTMLDivElement>(null)
  const targetLineRef = useRef<HTMLDivElement>(null)
  const currentBlockElemRef = useRef<HTMLElement | null>(null)
  const [contextMenu, setContextMenu] = useState<ContextMenuState | null>(null)

  if (!anchorElem) {
    return null
  }

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault()
    const blockElem = currentBlockElemRef.current
    if (!blockElem) return
    // Get node key at right-click time
    editor.getEditorState().read(() => {
      const node = $getNearestNodeFromDOMNode(blockElem)
      if (!node) return
      setContextMenu({ x: e.clientX, y: e.clientY, nodeKey: node.getKey() })
    })
  }

  const handleMoveUp = () => {
    const blockElem = currentBlockElemRef.current
    if (!blockElem) return
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(blockElem)
      if (!node) return
      const prev = node.getPreviousSibling()
      if (prev) prev.insertBefore(node)
    })
  }

  const handleMoveDown = () => {
    const blockElem = currentBlockElemRef.current
    if (!blockElem) return
    editor.update(() => {
      const node = $getNearestNodeFromDOMNode(blockElem)
      if (!node) return
      const next = node.getNextSibling()
      if (next) next.insertAfter(node)
    })
  }

  const handleDuplicate = () => {
    if (!contextMenu) return
    editor.update(() => {
      const node = $getNodeByKey(contextMenu.nodeKey)
      if (!node) return
      const serialized = node.exportJSON()
      const parsed = $parseSerializedNode(serialized)
      node.insertAfter(parsed)
    })
    setContextMenu(null)
  }

  const handleDelete = () => {
    if (!contextMenu) return
    editor.update(() => {
      $getNodeByKey(contextMenu.nodeKey)?.remove()
    })
    setContextMenu(null)
  }

  return createPortal(
    <>
      <DraggableBlockPlugin_EXPERIMENTAL
        anchorElem={anchorElem}
        menuRef={menuRef}
        targetLineRef={targetLineRef}
        menuComponent={
          <DragHandle
            menuRef={menuRef}
            onContextMenu={handleContextMenu}
            onMoveUp={handleMoveUp}
            onMoveDown={handleMoveDown}
          />
        }
        targetLineComponent={<TargetLine targetLineRef={targetLineRef} />}
        isOnMenu={(element: HTMLElement) =>
          element.closest('.draggable-block-menu') !== null
        }
        onElementChanged={(element) => {
          currentBlockElemRef.current = element
        }}
      />
      {contextMenu && (
        <DropdownMenu
          open
          onOpenChange={(open) => {
            if (!open) setContextMenu(null)
          }}
        >
          <DropdownMenuTrigger asChild>
            <span
              style={{
                position: 'fixed',
                left: contextMenu.x,
                top: contextMenu.y,
                width: 1,
                height: 1,
                pointerEvents: 'none',
              }}
            />
          </DropdownMenuTrigger>
          <DropdownMenuContent>
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
    anchorElem
  )
}
