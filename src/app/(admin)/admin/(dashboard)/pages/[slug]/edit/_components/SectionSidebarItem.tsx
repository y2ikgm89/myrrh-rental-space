'use client'

/**
 * サイドバーのセクションアイテム（DnD対応）
 *
 * コンパクトなリストアイテム + ⋯ メニュー
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  Button,
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/admin/components/ui'
import { GripVertical, MoreHorizontal, Eye, EyeOff, Copy, Trash2 } from 'lucide-react'
import { sectionTypeLabels } from '@/shared/lib/validations/section'
import type { PageSectionData } from '@/admin/actions/page-section'
import { SectionTypeIcon } from '../../sections/_components/SectionTypeIcon'

interface SectionSidebarItemProps {
  section: PageSectionData
  isSelected: boolean
  onSelect: (id: string) => void
  onToggle: (id: string, isActive: boolean) => void
  onDuplicate: (id: string) => void
  onDelete: (id: string) => void
  disabled: boolean
}

export function SectionSidebarItem({
  section,
  isSelected,
  onSelect,
  onToggle,
  onDuplicate,
  onDelete,
  disabled,
}: SectionSidebarItemProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: section.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
  }

  const label = sectionTypeLabels[section.type]

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer transition-colors ${
        isSelected
          ? 'bg-accent/10 border-l-2 border-l-primary'
          : 'hover:bg-accent/5 border-l-2 border-l-transparent'
      } ${!section.isActive ? 'opacity-50' : ''} ${isDragging ? 'shadow-lg z-10' : ''}`}
      onClick={() => onSelect(section.id)}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground shrink-0"
        {...attributes}
        {...listeners}
        disabled={disabled}
        onClick={(e) => e.stopPropagation()}
      >
        <GripVertical className="h-4 w-4" />
      </button>

      {/* Icon */}
      <div className="shrink-0">
        <SectionTypeIcon type={section.type} className="h-4 w-4 text-muted-foreground" />
      </div>

      {/* Label */}
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium truncate">
          {section.title || label}
        </p>
      </div>

      {/* Status */}
      {!section.isActive && (
        <EyeOff className="h-3 w-3 text-muted-foreground shrink-0" />
      )}

      {/* Menu */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            size="sm"
            className="h-6 w-6 p-0 opacity-0 group-hover:opacity-100 shrink-0"
            onClick={(e) => e.stopPropagation()}
          >
            <MoreHorizontal className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-40">
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onToggle(section.id, !section.isActive)
            }}
          >
            {section.isActive ? (
              <>
                <EyeOff className="h-4 w-4 mr-2" />
                非表示にする
              </>
            ) : (
              <>
                <Eye className="h-4 w-4 mr-2" />
                表示する
              </>
            )}
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={(e) => {
              e.stopPropagation()
              onDuplicate(section.id)
            }}
          >
            <Copy className="h-4 w-4 mr-2" />
            複製
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="text-destructive"
            onClick={(e) => {
              e.stopPropagation()
              onDelete(section.id)
            }}
          >
            <Trash2 className="h-4 w-4 mr-2" />
            削除
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
