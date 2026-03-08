'use client'

/**
 * @dnd-kit Sortable Components
 *
 * ドラッグ&ドロップで並び替え可能なリスト/テーブル用コンポーネント
 *
 * 使用例:
 * ```tsx
 * <SortableContext items={items.map(i => i.id)} strategy={verticalListSortingStrategy}>
 *   {items.map((item) => (
 *     <SortableItem key={item.id} id={item.id}>
 *       <div>...</div>
 *     </SortableItem>
 *   ))}
 * </SortableContext>
 * ```
 */

import type { ReactNode } from 'react'
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core'
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { cn } from '@/shared/lib/cn'

// =============================================================================
// Types
// =============================================================================

export type SortableItem = {
  id: string
}

export type SortableListProps<T extends SortableItem> = {
  items: T[]
  onReorder: (items: T[]) => void
  renderItem: (item: T, index: number) => ReactNode
  disabled?: boolean
  className?: string
}

export type SortableItemProps = {
  id: string
  children: ReactNode
  disabled?: boolean
  className?: string
}

export type DragHandleProps = {
  className?: string
  disabled?: boolean
}

// =============================================================================
// Drag Handle
// =============================================================================

export function DragHandle({ className, disabled }: DragHandleProps) {
  return (
    <div
      className={cn(
        'flex h-8 w-8 cursor-grab items-center justify-center rounded text-muted-foreground transition-colors',
        'hover:bg-muted hover:text-foreground',
        'active:cursor-grabbing',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
      aria-label="ドラッグして並び替え"
    >
      <svg
        className="h-4 w-4"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        viewBox="0 0 24 24"
      >
        <path d="M4 8h16M4 16h16" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </div>
  )
}

// =============================================================================
// Sortable Item
// =============================================================================

export function SortableItemWrapper({ id, children, disabled, className }: SortableItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        'relative',
        isDragging && 'z-50 opacity-50',
        className
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </div>
  )
}

// =============================================================================
// Sortable Table Row
// =============================================================================

export type SortableTableRowProps = {
  id: string
  children: ReactNode
  disabled?: boolean
  className?: string
}

export function SortableTableRow({ id, children, disabled, className }: SortableTableRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  return (
    <tr
      ref={setNodeRef}
      style={style}
      className={cn(
        'group',
        isDragging && 'z-50 bg-muted/80 shadow-lg',
        className
      )}
      {...attributes}
      {...listeners}
    >
      {children}
    </tr>
  )
}

// =============================================================================
// Sortable List Container
// =============================================================================

export function SortableList<T extends SortableItem>({
  items,
  onReorder,
  renderItem,
  disabled,
  className,
}: SortableListProps<T>) {
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event

    if (over && active.id !== over.id) {
      const oldIndex = items.findIndex((item) => item.id === active.id)
      const newIndex = items.findIndex((item) => item.id === over.id)
      const reordered = arrayMove(items, oldIndex, newIndex)
      onReorder(reordered)
    }
  }

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={handleDragEnd}
    >
      <SortableContext
        items={items.map((item) => item.id)}
        strategy={verticalListSortingStrategy}
        disabled={disabled}
      >
        <div className={className}>
          {items.map((item, index) => renderItem(item, index))}
        </div>
      </SortableContext>
    </DndContext>
  )
}

// =============================================================================
// Re-exports
// =============================================================================

export {
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  DragOverlay,
} from '@dnd-kit/core'

export type { DragEndEvent, DragStartEvent } from '@dnd-kit/core'

export {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
} from '@dnd-kit/sortable'

export { CSS } from '@dnd-kit/utilities'
