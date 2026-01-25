'use client'

/**
 * TaxonomyManager - カテゴリ・タグ統合管理コンポーネント
 *
 * タブ切り替えでカテゴリとタグを管理
 */

import { useState, useTransition, useMemo } from 'react'
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
  DialogFooter,
  DialogHeader,
  DialogTitle,
  Textarea,
  Tabs,
  TabsList,
  TabsTrigger,
  TabsContent,
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
  DeleteConfirmDialog,
  Checkbox,
  type DragEndEvent,
} from '@/admin/components/ui'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useTagFilters, type TagSortField } from '../_hooks/use-tag-filters'
import { DragHandle } from '@/admin/components/ui/sortable'
import {
  getBlogCategories,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
  updateBlogCategoryOrder,
  getBlogTags,
  createBlogTag,
  updateBlogTag,
  deleteBlogTag,
} from '@/admin/actions/blog'
import type {
  BlogCategoryData,
  BlogCategoryInput,
  BlogTagData,
  BlogTagInput,
} from '@/admin/lib/validations/blog'
import { cn } from '@/shared/lib/utils'

// =============================================================================
// Types & Schemas
// =============================================================================

type CategoryFormData = {
  name: string
  slug: string
  description?: string
  order: number
}

type TagFormData = {
  name: string
  slug: string
}

const categoryFormSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です').max(50, 'カテゴリ名は50文字以内'),
  slug: z
    .string()
    .min(1, 'スラッグは必須です')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(200).optional(),
  order: z.number().int().min(0),
}) satisfies z.ZodType<CategoryFormData>

const tagFormSchema = z.object({
  name: z.string().min(1, 'タグ名は必須です').max(50, 'タグ名は50文字以内'),
  slug: z
    .string()
    .min(1, 'スラッグは必須です')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
}) satisfies z.ZodType<TagFormData>

// =============================================================================
// Sortable Category Row
// =============================================================================

type SortableCategoryRowProps = {
  category: BlogCategoryData
  onEdit: (category: BlogCategoryData) => void
  onDelete: (id: string) => void
  isPending: boolean
}

function SortableCategoryRow({
  category,
  onEdit,
  onDelete,
  isPending,
}: SortableCategoryRowProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } =
    useSortable({ id: category.id })

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
            aria-label={`${category.name}カテゴリを編集`}
          >
            編集
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending || category._count.posts > 0}
            onClick={() => setDeleteDialogOpen(true)}
            aria-label={`${category.name}カテゴリを削除`}
          >
            削除
          </Button>
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            itemName={category.name}
            onConfirm={() => {
              onDelete(category.id)
              setDeleteDialogOpen(false)
            }}
            isPending={isPending}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

// =============================================================================
// Tag Row
// =============================================================================

type TagRowProps = {
  tag: BlogTagData
  onEdit: (tag: BlogTagData) => void
  onDelete: (id: string) => void
  isPending: boolean
}

function TagRow({ tag, onEdit, onDelete, isPending }: TagRowProps) {
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false)

  const formattedDate = new Date(tag.createdAt).toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  })

  return (
    <TableRow>
      <TableCell className="font-medium">{tag.name}</TableCell>
      <TableCell className="text-muted-foreground">{tag.slug}</TableCell>
      <TableCell>{tag._count.posts}</TableCell>
      <TableCell className="text-muted-foreground">{formattedDate}</TableCell>
      <TableCell>
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => onEdit(tag)}
            disabled={isPending}
            aria-label={`${tag.name}タグを編集`}
          >
            編集
          </Button>
          <Button
            variant="destructive"
            size="sm"
            disabled={isPending || tag._count.posts > 0}
            onClick={() => setDeleteDialogOpen(true)}
            aria-label={`${tag.name}タグを削除`}
          >
            削除
          </Button>
          <DeleteConfirmDialog
            open={deleteDialogOpen}
            onOpenChange={setDeleteDialogOpen}
            itemName={tag.name}
            onConfirm={() => {
              onDelete(tag.id)
              setDeleteDialogOpen(false)
            }}
            isPending={isPending}
          />
        </div>
      </TableCell>
    </TableRow>
  )
}

// =============================================================================
// Sortable Table Head
// =============================================================================

type SortableTableHeadProps = {
  field: TagSortField
  currentSortBy: TagSortField
  currentSortOrder: 'asc' | 'desc'
  onToggle: (field: TagSortField) => void
  children: React.ReactNode
  className?: string
}

function SortableTableHead({
  field,
  currentSortBy,
  currentSortOrder,
  onToggle,
  children,
  className,
}: SortableTableHeadProps) {
  const isActive = currentSortBy === field

  return (
    <TableHead className={className}>
      <button
        type="button"
        className="flex items-center gap-1 hover:text-foreground"
        onClick={() => onToggle(field)}
        aria-label={`${children}で並び替え`}
      >
        {children}
        {isActive ? (
          currentSortOrder === 'asc' ? (
            <ArrowUp className="h-4 w-4" />
          ) : (
            <ArrowDown className="h-4 w-4" />
          )
        ) : (
          <ArrowUpDown className="h-4 w-4 opacity-50" />
        )}
      </button>
    </TableHead>
  )
}

// =============================================================================
// Main Component
// =============================================================================

type TaxonomyManagerProps = {
  initialCategories: BlogCategoryData[]
  initialTags: BlogTagData[]
}

export function TaxonomyManager({ initialCategories, initialTags }: TaxonomyManagerProps) {
  const [isPending, startTransition] = useTransition()

  // Category State
  const [categories, setCategories] = useState<BlogCategoryData[]>(initialCategories)
  const [isCategoryDialogOpen, setIsCategoryDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BlogCategoryData | null>(null)

  // Tag State
  const [tags, setTags] = useState<BlogTagData[]>(initialTags)
  const [isTagDialogOpen, setIsTagDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<BlogTagData | null>(null)

  // Tag Filters
  const {
    params: tagFilterParams,
    setSearchDebounced: setTagSearchDebounced,
    toggleSort: toggleTagSort,
    setUnusedOnly: setTagUnusedOnly,
    reset: resetTagFilters,
  } = useTagFilters()

  // Filtered & Sorted Tags
  const filteredTags = useMemo(() => {
    let result = [...tags]

    // Search filter
    if (tagFilterParams.search) {
      const searchLower = tagFilterParams.search.toLowerCase()
      result = result.filter(
        (tag) =>
          tag.name.toLowerCase().includes(searchLower) ||
          tag.slug.toLowerCase().includes(searchLower)
      )
    }

    // Unused only filter
    if (tagFilterParams.unusedOnly) {
      result = result.filter((tag) => tag._count.posts === 0)
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (tagFilterParams.sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name, 'ja')
          break
        case 'postCount':
          comparison = a._count.posts - b._count.posts
          break
        case 'createdAt':
          comparison = new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
          break
      }
      return tagFilterParams.sortOrder === 'desc' ? -comparison : comparison
    })

    return result
  }, [tags, tagFilterParams])

  // D&D Sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  )

  // Category Form
  const categoryForm = useForm<CategoryFormData>({
    resolver: zodResolver(categoryFormSchema),
    defaultValues: { name: '', slug: '', description: '', order: 0 },
  })

  // Tag Form
  const tagForm = useForm<TagFormData>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { name: '', slug: '' },
  })

  // ==========================================================================
  // Category Handlers
  // ==========================================================================

  const openCreateCategoryDialog = () => {
    setEditingCategory(null)
    categoryForm.reset({ name: '', slug: '', description: '', order: categories.length })
    setIsCategoryDialogOpen(true)
  }

  const openEditCategoryDialog = (category: BlogCategoryData) => {
    setEditingCategory(category)
    categoryForm.reset({
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      order: category.order,
    })
    setIsCategoryDialogOpen(true)
  }

  const onCategorySubmit = (data: CategoryFormData) => {
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
          toast.success(result.message)
          const newCategories = await getBlogCategories()
          startTransition(() => {
            setIsCategoryDialogOpen(false)
            setCategories(newCategories)
          })
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createBlogCategory(payload)
        if (result.success) {
          toast.success(result.message)
          const newCategories = await getBlogCategories()
          startTransition(() => {
            setIsCategoryDialogOpen(false)
            setCategories(newCategories)
          })
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleDeleteCategory = (id: string) => {
    startTransition(async () => {
      const result = await deleteBlogCategory(id)
      if (result.success) {
        toast.success(result.message)
        const newCategories = await getBlogCategories()
        startTransition(() => {
          setCategories(newCategories)
        })
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleCategoryDragEnd = (event: DragEndEvent) => {
    const { active, over } = event
    if (!over || active.id === over.id) return

    const oldIndex = categories.findIndex((cat) => cat.id === active.id)
    const newIndex = categories.findIndex((cat) => cat.id === over.id)

    if (oldIndex === -1 || newIndex === -1) return

    const reordered = arrayMove(categories, oldIndex, newIndex)
    setCategories(reordered)

    const updates = reordered.map((cat, index) => ({ id: cat.id, order: index }))

    startTransition(async () => {
      const result = await updateBlogCategoryOrder(updates)
      if (!result.success) {
        toast.error(result.error)
        const newCategories = await getBlogCategories()
        startTransition(() => {
          setCategories(newCategories)
        })
      }
    })
  }

  const generateCategorySlug = () => {
    const name = categoryForm.getValues('name')
    if (name) {
      const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
      categoryForm.setValue('slug', slug)
    }
  }

  // ==========================================================================
  // Tag Handlers
  // ==========================================================================

  const openCreateTagDialog = () => {
    setEditingTag(null)
    tagForm.reset({ name: '', slug: '' })
    setIsTagDialogOpen(true)
  }

  const openEditTagDialog = (tag: BlogTagData) => {
    setEditingTag(tag)
    tagForm.reset({ name: tag.name, slug: tag.slug })
    setIsTagDialogOpen(true)
  }

  const onTagSubmit = (data: TagFormData) => {
    startTransition(async () => {
      const payload: BlogTagInput = { name: data.name, slug: data.slug }

      if (editingTag) {
        const result = await updateBlogTag(editingTag.id, payload)
        if (result.success) {
          toast.success(result.message)
          const newTags = await getBlogTags()
          startTransition(() => {
            setIsTagDialogOpen(false)
            setTags(newTags)
          })
        } else {
          toast.error(result.error)
        }
      } else {
        const result = await createBlogTag(payload)
        if (result.success) {
          toast.success(result.message)
          const newTags = await getBlogTags()
          startTransition(() => {
            setIsTagDialogOpen(false)
            setTags(newTags)
          })
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleDeleteTag = (id: string) => {
    startTransition(async () => {
      const result = await deleteBlogTag(id)
      if (result.success) {
        toast.success(result.message)
        const newTags = await getBlogTags()
        startTransition(() => {
          setTags(newTags)
        })
      } else {
        toast.error(result.error)
      }
    })
  }

  const generateTagSlug = () => {
    const name = tagForm.getValues('name')
    if (name) {
      const slug = name
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-z0-9\s-]/g, '')
        .replace(/\s+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 50)
      tagForm.setValue('slug', slug)
    }
  }

  // ==========================================================================
  // Render
  // ==========================================================================

  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div>
        <h1 className="text-2xl font-bold">カテゴリ・タグ管理</h1>
        <p className="text-muted-foreground">ブログ記事のカテゴリとタグを管理します</p>
      </div>

      {/* タブ */}
      <Tabs defaultValue="categories">
        <TabsList>
          <TabsTrigger value="categories">カテゴリ</TabsTrigger>
          <TabsTrigger value="tags">タグ</TabsTrigger>
        </TabsList>

        {/* カテゴリタブ */}
        <TabsContent value="categories">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>カテゴリ一覧</CardTitle>
              <Button onClick={openCreateCategoryDialog}>新規作成</Button>
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
                    onDragEnd={handleCategoryDragEnd}
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
                              onEdit={openEditCategoryDialog}
                              onDelete={handleDeleteCategory}
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
        </TabsContent>

        {/* タグタブ */}
        <TabsContent value="tags">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>タグ一覧</CardTitle>
              <Button onClick={openCreateTagDialog}>新規作成</Button>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* フィルター・ソートコントロール */}
              <div className="flex flex-wrap items-center gap-4">
                {/* 検索 */}
                <div className="relative flex-1 min-w-[200px]">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    type="search"
                    placeholder="タグを検索..."
                    defaultValue={tagFilterParams.search}
                    onChange={(e) => setTagSearchDebounced(e.target.value)}
                    className="pl-9"
                    aria-label="タグを検索"
                  />
                </div>

                {/* 未使用のみ */}
                <div className="flex items-center gap-2">
                  <Checkbox
                    id="unused-only"
                    checked={tagFilterParams.unusedOnly}
                    onCheckedChange={(checked) => setTagUnusedOnly(checked === true)}
                  />
                  <Label htmlFor="unused-only" className="text-sm cursor-pointer">
                    未使用のみ
                  </Label>
                </div>

                {/* リセット */}
                {(tagFilterParams.search ||
                  tagFilterParams.unusedOnly ||
                  tagFilterParams.sortBy !== 'name' ||
                  tagFilterParams.sortOrder !== 'asc') && (
                  <Button variant="ghost" size="sm" onClick={resetTagFilters}>
                    リセット
                  </Button>
                )}
              </div>

              {/* 結果件数 */}
              <div className="text-sm text-muted-foreground">
                {filteredTags.length === tags.length
                  ? `${tags.length}件のタグ`
                  : `${filteredTags.length}件 / ${tags.length}件のタグ`}
              </div>

              {/* テーブル */}
              {tags.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">タグがありません</div>
              ) : filteredTags.length === 0 ? (
                <div className="py-8 text-center text-muted-foreground">
                  条件に一致するタグがありません
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <SortableTableHead
                        field="name"
                        currentSortBy={tagFilterParams.sortBy}
                        currentSortOrder={tagFilterParams.sortOrder}
                        onToggle={toggleTagSort}
                      >
                        タグ名
                      </SortableTableHead>
                      <TableHead className="w-40">スラッグ</TableHead>
                      <SortableTableHead
                        field="postCount"
                        currentSortBy={tagFilterParams.sortBy}
                        currentSortOrder={tagFilterParams.sortOrder}
                        onToggle={toggleTagSort}
                        className="w-24"
                      >
                        記事数
                      </SortableTableHead>
                      <SortableTableHead
                        field="createdAt"
                        currentSortBy={tagFilterParams.sortBy}
                        currentSortOrder={tagFilterParams.sortOrder}
                        onToggle={toggleTagSort}
                        className="w-32"
                      >
                        作成日
                      </SortableTableHead>
                      <TableHead className="w-32">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTags.map((tag) => (
                      <TagRow
                        key={tag.id}
                        tag={tag}
                        onEdit={openEditTagDialog}
                        onDelete={handleDeleteTag}
                        isPending={isPending}
                      />
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* カテゴリ作成/編集ダイアログ */}
      <Dialog open={isCategoryDialogOpen} onOpenChange={setIsCategoryDialogOpen}>
        <DialogContent>
          <form onSubmit={categoryForm.handleSubmit(onCategorySubmit)}>
            <DialogHeader>
              <DialogTitle>
                {editingCategory ? 'カテゴリ編集' : 'カテゴリ作成'}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="category-name">カテゴリ名</Label>
                <Input
                  id="category-name"
                  {...categoryForm.register('name')}
                  placeholder="カテゴリ名"
                  disabled={isPending}
                />
                {categoryForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {categoryForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="category-slug">スラッグ</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateCategorySlug}
                    disabled={isPending}
                  >
                    名前から生成
                  </Button>
                </div>
                <Input
                  id="category-slug"
                  {...categoryForm.register('slug')}
                  placeholder="category-slug"
                  disabled={isPending}
                />
                {categoryForm.formState.errors.slug && (
                  <p className="text-sm text-destructive">
                    {categoryForm.formState.errors.slug.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <Label htmlFor="category-description">説明</Label>
                <Textarea
                  id="category-description"
                  {...categoryForm.register('description')}
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
                onClick={() => setIsCategoryDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? editingCategory
                    ? '更新中...'
                    : '作成中...'
                  : editingCategory
                    ? '更新'
                    : '作成'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* タグ作成/編集ダイアログ */}
      <Dialog open={isTagDialogOpen} onOpenChange={setIsTagDialogOpen}>
        <DialogContent>
          <form onSubmit={tagForm.handleSubmit(onTagSubmit)}>
            <DialogHeader>
              <DialogTitle>{editingTag ? 'タグ編集' : 'タグ作成'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">タグ名</Label>
                <Input
                  id="tag-name"
                  {...tagForm.register('name')}
                  placeholder="タグ名"
                  disabled={isPending}
                />
                {tagForm.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {tagForm.formState.errors.name.message}
                  </p>
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="tag-slug">スラッグ</Label>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={generateTagSlug}
                    disabled={isPending}
                  >
                    名前から生成
                  </Button>
                </div>
                <Input
                  id="tag-slug"
                  {...tagForm.register('slug')}
                  placeholder="tag-slug"
                  disabled={isPending}
                />
                {tagForm.formState.errors.slug && (
                  <p className="text-sm text-destructive">
                    {tagForm.formState.errors.slug.message}
                  </p>
                )}
              </div>
            </div>
            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsTagDialogOpen(false)}
                disabled={isPending}
              >
                キャンセル
              </Button>
              <Button type="submit" disabled={isPending}>
                {isPending
                  ? editingTag
                    ? '更新中...'
                    : '作成中...'
                  : editingTag
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
