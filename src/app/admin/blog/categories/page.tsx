'use client'

import { useEffect, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { z } from 'zod'
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
} from '@/components/admin/ui'
import {
  getBlogCategories,
  createBlogCategory,
  updateBlogCategory,
  deleteBlogCategory,
} from '@/actions/admin/blog'
import type { BlogCategoryData, BlogCategoryInput } from '@/actions/admin/blog'

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

export default function BlogCategoriesPage() {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [categories, setCategories] = useState<BlogCategoryData[]>([])
  const [isDialogOpen, setIsDialogOpen] = useState(false)
  const [editingCategory, setEditingCategory] = useState<BlogCategoryData | null>(null)
  const [deleteTargetId, setDeleteTargetId] = useState<string | null>(null)

  const {
    register,
    handleSubmit,
    reset,
    setValue,
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

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      const data = await getBlogCategories()
      if (!cancelled) {
        setCategories(data)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

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
          alert(result.error)
        }
      } else {
        const result = await createBlogCategory(payload)
        if (result.success) {
          setIsDialogOpen(false)
          loadCategories()
        } else {
          alert(result.error)
        }
      }
    })
  }

  const handleDelete = (id: string) => {
    startTransition(async () => {
      const result = await deleteBlogCategory(id)
      if (result.success) {
        setDeleteTargetId(null)
        loadCategories()
      } else {
        alert(result.error)
      }
    })
  }

  // 名前からスラッグを生成
  const generateSlug = () => {
    const name = document.querySelector<HTMLInputElement>('#name')?.value
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
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-16">順序</TableHead>
                  <TableHead>カテゴリ名</TableHead>
                  <TableHead className="w-40">スラッグ</TableHead>
                  <TableHead className="w-24">記事数</TableHead>
                  <TableHead className="w-32">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {categories.map((category) => (
                  <TableRow key={category.id}>
                    <TableCell>{category.order}</TableCell>
                    <TableCell className="font-medium">{category.name}</TableCell>
                    <TableCell className="text-muted-foreground">
                      {category.slug}
                    </TableCell>
                    <TableCell>{category._count.posts}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => openEditDialog(category)}
                          disabled={isPending}
                        >
                          編集
                        </Button>
                        <Dialog
                          open={deleteTargetId === category.id}
                          onOpenChange={(open) =>
                            setDeleteTargetId(open ? category.id : null)
                          }
                        >
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
                                onClick={() => setDeleteTargetId(null)}
                                disabled={isPending}
                              >
                                キャンセル
                              </Button>
                              <Button
                                variant="destructive"
                                onClick={() => handleDelete(category.id)}
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
                ))}
              </TableBody>
            </Table>
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

              <div className="space-y-2">
                <Label htmlFor="order">表示順</Label>
                <Input
                  id="order"
                  type="number"
                  {...register('order', { valueAsNumber: true })}
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
