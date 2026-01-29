'use client'

/**
 * ページセクションリスト
 *
 * DnDで順序変更可能なセクション一覧
 */

import { useState, useTransition, useEffect } from 'react'
import { toast } from 'sonner'
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
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  Button,
  Card,
  CardContent,
  Switch,
} from '@/admin/components/ui'
import {
  GripVertical,
  Plus,
  Settings,
  Trash2,
  Eye,
  EyeOff,
  ExternalLink,
  LayoutTemplate,
} from 'lucide-react'
import {
  getPageSections,
  updatePageSectionOrder,
  togglePageSection,
  deletePageSection,
  createPageSection,
  type PageSectionData,
} from '@/admin/actions/page-section'
import {
  PageSectionType,
  sectionTypeLabels,
  defaultSectionConfigs,
} from '@/shared/lib/validations/page-section'
import { SectionTypeIcon } from './SectionTypeIcon'
import { AddSectionDialog } from './AddSectionDialog'
import { logger } from '@/shared/lib/logger'

// =============================================================================
// Sortable Section Item
// =============================================================================

interface SortableSectionItemProps {
  section: PageSectionData
  onEdit: (section: PageSectionData) => void
  onToggle: (id: string, isActive: boolean) => void
  onDelete: (id: string) => void
  disabled: boolean
}

function SortableSectionItem({
  section,
  onEdit,
  onToggle,
  onDelete,
  disabled,
}: SortableSectionItemProps) {
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
      className={`flex items-center gap-3 rounded-lg border bg-card p-4 ${
        !section.isActive ? 'opacity-60 bg-muted/30' : ''
      } ${isDragging ? 'shadow-lg' : ''}`}
    >
      {/* Drag Handle */}
      <button
        type="button"
        className="cursor-grab touch-none text-muted-foreground hover:text-foreground"
        {...attributes}
        {...listeners}
        disabled={disabled}
      >
        <GripVertical className="h-5 w-5" />
      </button>

      {/* Icon & Label */}
      <div className="flex items-center gap-3 flex-1 min-w-0">
        <div className="p-2 rounded-md bg-primary/10">
          <SectionTypeIcon type={section.type} className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{section.title || label}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        {section.isActive ? (
          <span className="flex items-center gap-1 text-xs text-success bg-success/10 px-2 py-1 rounded">
            <Eye className="h-3 w-3" />
            表示
          </span>
        ) : (
          <span className="flex items-center gap-1 text-xs text-muted-foreground bg-muted px-2 py-1 rounded">
            <EyeOff className="h-3 w-3" />
            非表示
          </span>
        )}
      </div>

      {/* Actions */}
      <div className="flex items-center gap-1">
        <Switch
          checked={section.isActive}
          onCheckedChange={(checked: boolean) => onToggle(section.id, checked)}
          disabled={disabled}
        />
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onEdit(section)}
          disabled={disabled}
        >
          <Settings className="h-4 w-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onDelete(section.id)}
          disabled={disabled}
        >
          <Trash2 className="h-4 w-4 text-destructive" />
        </Button>
      </div>
    </div>
  )
}

// =============================================================================
// Main Component
// =============================================================================

interface PageSectionListProps {
  pageId: string
  pageSlug: string
  onEditSection: (section: PageSectionData) => void
}

export function PageSectionList({
  pageId,
  pageSlug,
  onEditSection,
}: PageSectionListProps) {
  const [isPending, startTransition] = useTransition()
  const [sections, setSections] = useState<PageSectionData[] | null>(null)
  const [deletingSectionId, setDeletingSectionId] = useState<string | null>(null)
  const [showAddDialog, setShowAddDialog] = useState(false)

  // DnD sensors
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  )

  // Load sections
  useEffect(() => {
    let cancelled = false

    async function load() {
      try {
        const data = await getPageSections(pageId)
        if (!cancelled) setSections(data)
      } catch (error) {
        logger.error('Failed to load sections', {
          error: error instanceof Error ? error.message : String(error),
        })
        if (!cancelled) toast.error('セクションの読み込みに失敗しました')
      }
    }

    load()
    return () => { cancelled = true }
  }, [pageId])

  // Reload sections from server (used to revert optimistic updates on error)
  function reloadSections() {
    getPageSections(pageId).then(setSections).catch(() => {})
  }

  // Handlers
  function handleToggle(id: string, isActive: boolean) {
    setSections((prev) =>
      prev?.map((s) => (s.id === id ? { ...s, isActive } : s)) ?? null
    )

    startTransition(async () => {
      const result = await togglePageSection(id, isActive)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
        reloadSections()
      }
    })
  }

  function handleDeleteConfirm() {
    if (!deletingSectionId) return
    const id = deletingSectionId
    setDeletingSectionId(null)

    setSections((prev) => prev?.filter((s) => s.id !== id) ?? null)

    startTransition(async () => {
      const result = await deletePageSection(id)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
        reloadSections()
      }
    })
  }

  function handleAddSection(type: PageSectionType) {
    startTransition(async () => {
      const result = await createPageSection({
        pageId,
        type,
        config: defaultSectionConfigs[type],
        isActive: true,
      })
      if (!result.success) {
        toast.error(result.error)
        return
      }
      toast.success(result.message)
      const data = await getPageSections(pageId)
      startTransition(() => setSections(data))
    })
  }

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event
    if (!over || active.id === over.id || !sections) return

    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)

    const reordered = arrayMove(sections, oldIndex, newIndex)
    const orderUpdates = reordered.map((s, index) => ({
      id: s.id,
      order: index,
    }))

    setSections(reordered)

    startTransition(async () => {
      const result = await updatePageSectionOrder(pageId, { sections: orderUpdates })
      if (!result.success) {
        toast.error(result.error)
        reloadSections()
      }
    })
  }

  // Loading state
  if (sections === null) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  // No sections
  if (sections.length === 0) {
    return (
      <div className="space-y-6">
        <div className="text-center py-12">
          <div className="p-4 rounded-full bg-muted/50 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
            <LayoutTemplate className="h-8 w-8 text-muted-foreground" />
          </div>
          <h3 className="text-lg font-medium mb-2">セクションがありません</h3>
          <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
            ページにセクションを追加して、コンテンツを構成しましょう
          </p>
          <Button onClick={() => setShowAddDialog(true)} disabled={isPending}>
            <Plus className="h-4 w-4 mr-2" />
            セクションを追加
          </Button>
        </div>

        <AddSectionDialog
          open={showAddDialog}
          onOpenChange={setShowAddDialog}
          onAdd={handleAddSection}
          disabled={isPending}
        />
      </div>
    )
  }

  // Main list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm text-muted-foreground">
            ドラッグで順序変更、スイッチで表示/非表示を切り替え
          </p>
        </div>
        <Button onClick={() => setShowAddDialog(true)} disabled={isPending}>
          <Plus className="h-4 w-4 mr-2" />
          セクションを追加
        </Button>
      </div>

      {/* Section List */}
      <DndContext
        sensors={sensors}
        collisionDetection={closestCenter}
        onDragEnd={handleDragEnd}
      >
        <SortableContext
          items={sections.map((s) => s.id)}
          strategy={verticalListSortingStrategy}
        >
          <div className="space-y-2">
            {sections.map((section) => (
              <SortableSectionItem
                key={section.id}
                section={section}
                onEdit={onEditSection}
                onToggle={handleToggle}
                onDelete={setDeletingSectionId}
                disabled={isPending}
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Preview Link */}
      <Card className="bg-muted/50">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <h4 className="font-medium">プレビュー</h4>
              <p className="text-sm text-muted-foreground">
                設定内容をページで確認
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open(`/${pageSlug}`, '_blank')}
              disabled={isPending}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              ページを開く
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Add Section Dialog */}
      <AddSectionDialog
        open={showAddDialog}
        onOpenChange={setShowAddDialog}
        onAdd={handleAddSection}
        disabled={isPending}
      />

      {/* Delete Confirmation Dialog */}
      <AlertDialog
        open={!!deletingSectionId}
        onOpenChange={(open: boolean) => !open && setDeletingSectionId(null)}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>セクションを削除</AlertDialogTitle>
            <AlertDialogDescription>
              このセクションを削除しますか？この操作は取り消せません。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>キャンセル</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteConfirm}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              削除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
