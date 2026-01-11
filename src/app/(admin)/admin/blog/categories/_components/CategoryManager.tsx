'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
import { toast } from 'sonner'
import {
  Button,
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Input,
  Label,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Textarea,
  DndContext,
  closestCenter,
  useSensor,
  useSensors,
  PointerSensor,
  KeyboardSensor,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
  arrayMove,
  CSS,
  type DragEndEvent,
} from '@/components/admin/ui'
import { DragHandle } from '@/components/admin/ui/sortable'
import {
  getBlogCategories,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  updateBlogCategoryOrder,
} from '@/actions/admin/blog'
import type { BlogCategoryData, BlogCategoryInput } from '@/actions/admin/blog'
import { cn } from '@/lib/utils'

// =============================================================================
// Types & Schema
// =============================================================================

type FormData = {
  name: string
  slug: string
  description?: string
  order: number
}

const formSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です').max(50, 'カテゴリ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(200).optional(),
  order: z.number().int().min(0),
}) satisfies z.ZodType<FormData>

// =============================================================================
// Sortable Category Row
// =============================================================================

type SortableCategoryRowProps = {
  category: BlogCategoryData
  onEdit: (category: BlogCategoryData) => void
  onDelete: (id: string) => void
  isPending: boolean
}

function SortableCategoryRow({ category, onEdit, onDelete, isPending }: SortableCategoryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: category.id })

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  return (
    <TableRow
      ref={setNodeRef}
      style={style}
      className={cn(isDragging && 'z-50 bg-muted/80 shadow-lg')}
    >
      <TableCell className="w-12">
        <div {...attributes} {...listeners}>
          <DragHandle />
        </div>
      </TableCell>
      <TableCell className="font-medium">{category.name}</TableCell>
      <TableCell className="text-muted-foreground">{category.slug}</TableCell>
      <TableCell>{category._count.posts}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(category)}
            disabled={isPending}
          >
            編集
          </Button>
          <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
            <DialogTrigger asChild>
              <Button
                variant="destructive"
                size="sm"
                disabled={isPending || category._count.posts > 0}
              >
                削除
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>カテゴリを削除しますか？</DialogTitle>
                <DialogDescription>
                  この操作は取り消せません。本当に削除してもよろしいですか？
                </DialogDescription>
              </DialogHeader>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => setDeleteDialogOpen(false)}
                  disabled={isPending}
                >
                  キャンセル
                </Button>
                <Button
                  variant="destructive"
                  onClick={() => {
                    onDelete(category.id)
                    setDeleteDialogOpen(false)
                  }}
                  disabled={isPending}
                >
                  {isPending ? '削除中...' : '削除する'}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </TableCell>
    </TableRow>
  )
}

// =============================================================================
// Main Component
// =============================================================================

type CategoryManagerProps = {
  initialCategories: BlogCategoryData[]
}

export function CategoryManager({ initialCategories }: CategoryManagerProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [categories, setCategories] = useState<BlogCategoryData[]>(initialCategories)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BlogCategoryData | null>(null)

  // D&D Sensors
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

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    watch,
    formState: { errors },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: '',
      slug: '',
      description: '',
      order: 0,
    },
  })

  const loadCategories = async () => {
    const data = await getBlogCategories()
    setCategories(data)
  }

  const openCreateDialog = () => {
    setEditingCategory(null)
    reset({
      name: '',
      slug: '',
      description: '',
      order: categories.length,
    })
    setIsDialogOpen(true)
  }

  const openEditDialog = (category: BlogCategoryData) => {
    setEditingCategory(category)
    reset({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      order: category.order,
    })
    setIsDialogOpen(true)
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const payload: BlogCategoryInput = {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        order: data.order,
      }

      if (editingCategory) {
        const result = await updateBlogCategory(editingCategory.id, payload)
        if (result.success) {
          setIsDialogOpen(false)
          loadCategories()
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createBlogCategory(payload)
        if (result.success) {
          setIsDialogOpen(false)
          loadCategories()
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteBlogCategory(id)
      if (result.success) {
        loadCategories()
      } else {
        toast.error(result.error)
      }
    })
  }

  // D&D Handler
  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex((cat) => cat.id === active.id)
    const newIndex = categories.findIndex((cat) => cat.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)

    const updates = reordered.map((cat, index) => ({
      id: cat.id,
      order: index,
    }))

    startTransition(async () => {
      const result = await updateBlogCategoryOrder(updates)
      if (!result.success) {
        toast.error(result.error)
        loadCategories()
      }
    })
  }

  // 名前からスラッグを生成
  const generateSlug = () => {
    const name = watch('name')
    if (name) {
      const slug = name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .trim()
      setValue('slug', slug)
    }
  }

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">カテゴリ管理</h1>
          <p className="text-muted-foreground">
            ブログ記事のカテゴリを管理します
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => router.push('/admin/blog')}>
            ブログ一覧に戻る
          </Button>
          <Button onClick={openCreateDialog}>新規作成</Button>
        </div>
      </div>

      {/* カテゴリ一覧 */}
      <Card>
        <CardHeader>
          <CardTitle>カテゴリ一覧</CardTitle>
        </CardHeader>
        <CardContent>
          {categories.length === 0 ? (
            <div className="py-8 text-center text-muted-foreground">
              カテゴリがありません
            </div>
          ) : (
            <>
              <p className="mb-4 text-sm text-muted-foreground">
                ドラッグ&ドロップで順序を変更できます
              </p>
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={categories.map((cat) => cat.id)}
                  strategy={verticalListSortingStrategy}
                >
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-12"></TableHead>
                        <TableHead>カテゴリ名</TableHead>
                        <TableHead className="w-40">スラッグ</TableHead>
                        <TableHead className="w-24">記事数</TableHead>
                        <TableHead className="w-32">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {categories.map((category) => (
                        <SortableCategoryRow
                          key={category.id}
                          category={category}
                          onEdit={openEditDialog}
                          onDelete={handleDelete}
                          isPending={isPending}
                        />
                      ))}
                    </TableBody>
                  </Table>
                </SortableContext>
              </DndContext>
            </>
          )}
        </CardContent>
      </Card>

      {/* 作成/編集ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'カテゴリ編集' : 'カテゴリ作成'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">カテゴリ名</Label>
                <Input
                  id="name"
                  {...register('name')}
                  placeholder="カテゴリ名"
                  disabled={isPending}
                />
                {errors.name && (
                  <p className="text-sm text-destructive">{errors.name.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="slug">スラッグ</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateSlug}
                    disabled={isPending}
                  >
                    名前から生成
                  </Button>
                </div>
                <Input
                  id="slug"
                  {...register('slug')}
                  placeholder="category-slug"
                  disabled={isPending}
                />
                {errors.slug && (
                  <p className="text-sm text-destructive">{errors.slug.message}</p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">説明</Label>
                <Textarea
                  id="description"
                  {...register('description')}
                  placeholder="カテゴリの説明"
                  rows={2}
                  disabled={isPending}
                />
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? '保存中...'
                  : editingCategory
                    ? '更新'
                    : '作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  )
}
