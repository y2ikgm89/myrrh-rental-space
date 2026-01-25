'use client'

/**
 * ホームページセクション管理タブ
 *
 * HomepageSectionモデルベースの統一セクション管理
 * - DnDで順序変更
 * - セクション別設定編集
 * - ON/OFF切り替え
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
  Sparkles,
  Layout,
  Newspaper,
  FileText,
  HelpCircle,
  MousePointerClick,
  Wand2,
  Instagram,
} from 'lucide-react'
import {
  getHomepageSections,
  updateSectionOrder,
  toggleHomepageSection,
  deleteHomepageSection,
  createHomepageSection,
  initializeDefaultSections,
  type HomepageSectionData,
} from '@/admin/actions/homepage-settings'
import {
  sectionTypeLabels,
  defaultSectionConfigs,
  HomepageSectionType,
} from '@/admin/lib/validations/homepage-section'
import { SectionEditor } from './SectionEditor'
import { logger } from '@/shared/lib/logger'

// =============================================================================
// Icons Mapping
// =============================================================================

const sectionTypeIcons: Record<HomepageSectionType, typeof Sparkles> = {
  [HomepageSectionType.HERO]: Sparkles,
  [HomepageSectionType.SPACE_LIST]: Layout,
  [HomepageSectionType.NEWS]: Newspaper,
  [HomepageSectionType.BLOG]: FileText,
  [HomepageSectionType.FAQ]: HelpCircle,
  [HomepageSectionType.CTA]: MousePointerClick,
  [HomepageSectionType.CUSTOM]: Wand2,
  [HomepageSectionType.INSTAGRAM]: Instagram,
}

// =============================================================================
// Sortable Section Item
// =============================================================================

interface SortableSectionItemProps {
  section: HomepageSectionData
  onEdit: (section: HomepageSectionData) => void
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

  const Icon = sectionTypeIcons[section.type]
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
          <Icon className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0">
          <p className="font-medium truncate">{section.title || label}</p>
          <p className="text-sm text-muted-foreground">{label}</p>
        </div>
      </div>

      {/* Status Badge */}
      <div className="flex items-center gap-2">
        {section.isActive ? (
          <span className="flex items-center gap-1 text-xs text-green-600 bg-green-100 dark:bg-green-900/30 px-2 py-1 rounded">
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
// Add Section Dialog
// =============================================================================

interface AddSectionDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  onAdd: (type: HomepageSectionType) => void
  disabled: boolean
  existingTypes: HomepageSectionType[]
}

function AddSectionDialog({
  open,
  onOpenChange,
  onAdd,
  disabled,
  existingTypes,
}: AddSectionDialogProps) {
  const availableTypes = Object.values(HomepageSectionType).filter(
    (type) => type === HomepageSectionType.CUSTOM || !existingTypes.includes(type)
  )

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle>セクションを追加</AlertDialogTitle>
          <AlertDialogDescription>
            ホームページに追加するセクションタイプを選択
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="grid gap-2 py-4">
          {availableTypes.map((type) => {
            const Icon = sectionTypeIcons[type]
            const label = sectionTypeLabels[type]
            const isCustom = type === HomepageSectionType.CUSTOM
            const alreadyExists = existingTypes.includes(type)

            return (
              <button
                key={type}
                type="button"
                onClick={() => {
                  onAdd(type)
                  onOpenChange(false)
                }}
                disabled={disabled}
                className="flex items-center gap-3 p-3 rounded-lg border hover:bg-muted/50 transition-colors text-left disabled:opacity-50"
              >
                <div className="p-2 rounded-md bg-primary/10">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
                <div className="flex-1">
                  <p className="font-medium">{label}</p>
                  {isCustom && (
                    <p className="text-xs text-muted-foreground">
                      複数追加可能
                    </p>
                  )}
                  {alreadyExists && !isCustom && (
                    <p className="text-xs text-amber-600">
                      既に存在します（再追加可能）
                    </p>
                  )}
                </div>
              </button>
            )
          })}
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel>キャンセル</AlertDialogCancel>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}

// =============================================================================
// Main Component
// =============================================================================

export function HomepageTab() {
  const [isPending, startTransition] = useTransition()
  const [sections, setSections] = useState<HomepageSectionData[] | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [editingSection, setEditingSection] = useState<HomepageSectionData | null>(null)
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
  const loadSections = async () => {
    try {
      const data = await getHomepageSections()
      setSections(data)
    } catch (error) {
      logger.error('Failed to load sections', { error: error instanceof Error ? error.message : String(error) })
      toast.error('セクションの読み込みに失敗しました')
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    loadSections()
  }, [])

  // Handlers
  const handleToggle = (id: string, isActive: boolean) => {
    // Optimistic update
    setSections((prev) =>
      prev?.map((s) => (s.id === id ? { ...s, isActive } : s)) ?? null
    )

    startTransition(async () => {
      const result = await toggleHomepageSection(id, isActive)
      if (result.success) {
        toast.success(result.message)
      } else {
        toast.error(result.error)
        loadSections() // Revert on error
      }
    })
  }

  const handleDeleteConfirm = () => {
    if (!deletingSectionId) return
    const id = deletingSectionId
    setDeletingSectionId(null)

    startTransition(async () => {
      const result = await deleteHomepageSection(id)
      if (result.success) {
        toast.success(result.message)
        loadSections()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleAddSection = (type: HomepageSectionType) => {
    startTransition(async () => {
      const result = await createHomepageSection({
        type,
        config: defaultSectionConfigs[type],
        isActive: true,
      })
      if (result.success) {
        toast.success(result.message)
        loadSections()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleInitializeDefaults = () => {
    startTransition(async () => {
      const result = await initializeDefaultSections()
      if (result.success) {
        toast.success(result.message)
        loadSections()
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id || !sections) return

    const oldIndex = sections.findIndex((s) => s.id === active.id)
    const newIndex = sections.findIndex((s) => s.id === over.id)

    const newSections = arrayMove(sections, oldIndex, newIndex)
    const orderUpdates = newSections.map((s, index) => ({
      id: s.id,
      order: index,
    }))

    // Optimistic update
    setSections(newSections)

    startTransition(async () => {
      const result = await updateSectionOrder({ sections: orderUpdates })
      if (!result.success) {
        toast.error(result.error)
        loadSections() // Revert on error
      }
    })
  }

  const handleEditComplete = () => {
    setEditingSection(null)
    loadSections()
  }

  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-20 animate-pulse rounded-lg bg-muted" />
        ))}
      </div>
    )
  }

  // No sections - show initialize button
  if (!sections || sections.length === 0) {
    return (
      <div className="text-center py-12">
        <div className="p-4 rounded-full bg-muted/50 w-16 h-16 mx-auto mb-4 flex items-center justify-center">
          <Layout className="h-8 w-8 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium mb-2">セクションがありません</h3>
        <p className="text-muted-foreground mb-6 max-w-sm mx-auto">
          ホームページのセクションを初期化するか、新しいセクションを追加してください
        </p>
        <div className="flex items-center justify-center gap-4">
          <Button onClick={handleInitializeDefaults} disabled={isPending}>
            <Sparkles className="h-4 w-4 mr-2" />
            デフォルトセクションを作成
          </Button>
          <Button
            variant="outline"
            onClick={() => setShowAddDialog(true)}
            disabled={isPending}
          >
            <Plus className="h-4 w-4 mr-2" />
            セクションを追加
          </Button>
        </div>
      </div>
    )
  }

  // Section editor view
  if (editingSection) {
    return (
      <SectionEditor
        section={editingSection}
        onBack={() => setEditingSection(null)}
        onSave={handleEditComplete}
      />
    )
  }

  // Main list view
  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-medium">ホームページセクション</h3>
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
                onEdit={setEditingSection}
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
                設定内容をホームページで確認
              </p>
            </div>
            <Button
              variant="outline"
              onClick={() => window.open('/', '_blank')}
              disabled={isPending}
            >
              <ExternalLink className="h-4 w-4 mr-2" />
              ホームページを開く
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
        existingTypes={sections.map((s) => s.type)}
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
