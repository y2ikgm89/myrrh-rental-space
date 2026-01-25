'use client'

/**
 * TagManager - タグ管理コンポーネント
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
  DeleteConfirmDialog,
  Checkbox,
} from '@/admin/components/ui'
import { Search, ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react'
import { useTagFilters, type TagSortField } from '../_hooks/use-tag-filters'
import {
  getBlogTags,
  createBlogTag,
  updateBlogTag,
  deleteBlogTag,
} from '@/admin/actions/blog'
import type { BlogTagData, BlogTagInput } from '@/admin/lib/validations/blog'

// =============================================================================
// Types & Schemas
// =============================================================================

type TagFormData = {
  name: string
  slug: string
}

const tagFormSchema = z.object({
  name: z.string().min(1, 'タグ名は必須です').max(50, 'タグ名は50文字以内'),
  slug: z
    .string()
    .min(1, 'スラッグは必須です')
    .max(50)
    .regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
}) satisfies z.ZodType<TagFormData>

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

type TagManagerProps = {
  initialTags: BlogTagData[]
}

export function TagManager({ initialTags }: TagManagerProps) {
  const [isPending, startTransition] = useTransition()
  const [tags, setTags] = useState<BlogTagData[]>(initialTags)
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingTag, setEditingTag] = useState<BlogTagData | null>(null)

  // Filters
  const {
    params: filterParams,
    setSearchDebounced,
    toggleSort,
    setUnusedOnly,
    reset: resetFilters,
  } = useTagFilters()

  // Filtered & Sorted Tags
  const filteredTags = useMemo(() => {
    let result = [...tags]

    // Search filter
    if (filterParams.search) {
      const searchLower = filterParams.search.toLowerCase()
      result = result.filter(
        (tag) =>
          tag.name.toLowerCase().includes(searchLower) ||
          tag.slug.toLowerCase().includes(searchLower)
      )
    }

    // Unused only filter
    if (filterParams.unusedOnly) {
      result = result.filter((tag) => tag._count.posts === 0)
    }

    // Sort
    result.sort((a, b) => {
      let comparison = 0
      switch (filterParams.sortBy) {
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
      return filterParams.sortOrder === 'desc' ? -comparison : comparison
    })

    return result
  }, [tags, filterParams])

  // Form
  const form = useForm<TagFormData>({
    resolver: zodResolver(tagFormSchema),
    defaultValues: { name: '', slug: '' },
  })

  const openCreateDialog = () => {
    setEditingTag(null)
    form.reset({ name: '', slug: '' })
    setIsDialogOpen(true)
  }

  const openEditDialog = (tag: BlogTagData) => {
    setEditingTag(tag)
    form.reset({ name: tag.name, slug: tag.slug })
    setIsDialogOpen(true)
  }

  const onSubmit = (data: TagFormData) => {
    startTransition(async () => {
      const payload: BlogTagInput = { name: data.name, slug: data.slug }

      if (editingTag) {
        const result = await updateBlogTag(editingTag.id, payload)
        if (result.success) {
          toast.success(result.message)
          const newTags = await getBlogTags()
          startTransition(() => {
            setIsDialogOpen(false)
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
            setIsDialogOpen(false)
            setTags(newTags)
          })
        } else {
          toast.error(result.error)
        }
      }
    })
  }

  const handleDelete = (id: string) => {
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

  const generateSlug = () => {
    const name = form.getValues('name')
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
      form.setValue('slug', slug)
    }
  }

  return (
    <>
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <CardTitle>タグ一覧</CardTitle>
          <Button onClick={openCreateDialog}>新規作成</Button>
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
                defaultValue={filterParams.search}
                onChange={(e) => setSearchDebounced(e.target.value)}
                className="pl-9"
                aria-label="タグを検索"
              />
            </div>

            {/* 未使用のみ */}
            <div className="flex items-center gap-2">
              <Checkbox
                id="unused-only"
                checked={filterParams.unusedOnly}
                onCheckedChange={(checked) => setUnusedOnly(checked === true)}
              />
              <Label htmlFor="unused-only" className="text-sm cursor-pointer">
                未使用のみ
              </Label>
            </div>

            {/* リセット */}
            {(filterParams.search ||
              filterParams.unusedOnly ||
              filterParams.sortBy !== 'name' ||
              filterParams.sortOrder !== 'asc') && (
              <Button variant="ghost" size="sm" onClick={resetFilters}>
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
                    currentSortBy={filterParams.sortBy}
                    currentSortOrder={filterParams.sortOrder}
                    onToggle={toggleSort}
                  >
                    タグ名
                  </SortableTableHead>
                  <TableHead className="w-40">スラッグ</TableHead>
                  <SortableTableHead
                    field="postCount"
                    currentSortBy={filterParams.sortBy}
                    currentSortOrder={filterParams.sortOrder}
                    onToggle={toggleSort}
                    className="w-24"
                  >
                    記事数
                  </SortableTableHead>
                  <SortableTableHead
                    field="createdAt"
                    currentSortBy={filterParams.sortBy}
                    currentSortOrder={filterParams.sortOrder}
                    onToggle={toggleSort}
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
                    onEdit={openEditDialog}
                    onDelete={handleDelete}
                    isPending={isPending}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* タグ作成/編集ダイアログ */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent>
          <form onSubmit={form.handleSubmit(onSubmit)}>
            <DialogHeader>
              <DialogTitle>{editingTag ? 'タグ編集' : 'タグ作成'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="tag-name">タグ名</Label>
                <Input
                  id="tag-name"
                  {...form.register('name')}
                  placeholder="タグ名"
                  disabled={isPending}
                />
                {form.formState.errors.name && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.name.message}
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
                    onClick={generateSlug}
                    disabled={isPending}
                  >
                    名前から生成
                  </Button>
                </div>
                <Input
                  id="tag-slug"
                  {...form.register('slug')}
                  placeholder="tag-slug"
                  disabled={isPending}
                />
                {form.formState.errors.slug && (
                  <p className="text-sm text-destructive">
                    {form.formState.errors.slug.message}
                  </p>
                )}
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
    </>
  )
}
