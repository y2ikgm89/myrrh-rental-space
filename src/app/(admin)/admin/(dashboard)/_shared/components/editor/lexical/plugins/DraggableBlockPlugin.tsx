/**
 * Draggable Block Plugin
 *
 * @description ブロックのドラッグ＆ドロップ並べ替えを提供するプラグイン
 *
 * @lexical/react の DraggableBlockPlugin_EXPERIMENTAL をラップ
 */

'use client'

import { useRef } from 'react'
import { createPortal } from 'react-dom'
import { DraggableBlockPlugin_EXPERIMENTAL } from '@lexical/react/LexicalDraggableBlockPlugin'
import { GripVertical } from 'lucide-react'

// =============================================================================
// Types
// =============================================================================

type DraggableBlockPluginProps = {
  anchorElem: HTMLElement | null
}

// =============================================================================
// Drag Handle Component
// =============================================================================

function DragHandle({
  menuRef,
}: {
  menuRef: React.RefObject<HTMLDivElement | null>
}) {
  return (
    <div
      ref={menuRef}
      className="draggable-block-menu absolute left-1 top-0 cursor-grab rounded p-1 opacity-0 transition-opacity hover:bg-muted active:cursor-grabbing"
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
  targetLineRef: React.RefObject<HTMLDivElement | null>
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
  const menuRef = useRef<HTMLDivElement>(null)
  const targetLineRef = useRef<HTMLDivElement>(null)

  if (!anchorElem) {
    return null
  }

  return createPortal(
    <DraggableBlockPlugin_EXPERIMENTAL
      anchorElem={anchorElem}
      menuRef={menuRef}
      targetLineRef={targetLineRef}
      menuComponent={<DragHandle menuRef={menuRef} />}
      targetLineComponent={<TargetLine targetLineRef={targetLineRef} />}
      isOnMenu={(element: HTMLElement) =>
        element.closest('.draggable-block-menu') !== null
      }
    />,
    anchorElem
  )
}
