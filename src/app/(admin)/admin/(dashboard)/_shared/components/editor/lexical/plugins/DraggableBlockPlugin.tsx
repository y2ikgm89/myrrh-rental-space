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
import { GripVertical } from 'lucide-react'
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
}: {
  menuRef: RefObject<HTMLDivElement | null>
  onContextMenu: (e: React.MouseEvent) => void
}) {
  return (
    <div
      ref={menuRef}
      className="draggable-block-menu absolute left-1 top-0 cursor-grab rounded p-1 opacity-0 transition-opacity hover:bg-muted active:cursor-grabbing"
      onContextMenu={onContextMenu}
    >
      <GripVertical className="h-5 w-5 text-muted-foreground" />
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
          <DragHandle menuRef={menuRef} onContextMenu={handleContextMenu} />
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
