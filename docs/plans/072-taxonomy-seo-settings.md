# カテゴリ・タグSEO設定機能 実装計画

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 投稿カテゴリ・タグに専用編集ページを追加し、SEO/OGP設定を可能にする

**Architecture:** Prismaスキーマ拡張 → バリデーション・型定義更新 → Server Actions追加 → 専用編集ページ作成 → 公開ページのメタデータ改善

**Tech Stack:** Prisma 7 / Zod 4 / Next.js 16 / React 19 / react-hook-form / Tailwind CSS 4

---

## Task 1: Prismaスキーマ拡張

**Files:**
- Modify: `prisma/schema.prisma:607-630`

**Step 1: PostCategoryモデルにSEOフィールド追加**

```prisma
model PostCategory {
  id          String   @id @default(uuid())
  name        String   @unique
  slug        String   @unique
  description String?  @db.Text
  order       Int      @default(0)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  // SEO/OGP fields
  metaTitle       String?
  metaDescription String? @db.Text
  ogpImageUrl     String?

  // Relations
  posts Post[]

  @@index([order])
  @@map("post_categories")
}
```

**Step 2: PostTagモデルにSEOフィールド追加**

```prisma
model PostTag {
  id        String   @id @default(uuid())
  name      String   @unique
  slug      String   @unique
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  // SEO/OGP fields
  description     String? @db.Text
  metaTitle       String?
  metaDescription String? @db.Text
  ogpImageUrl     String?

  @@map("post_tags")
}
```

**Step 3: マイグレーション実行**

Run: `bunx --bun prisma migrate dev --name add_taxonomy_seo_fields`
Expected: Migration created and applied successfully

**Step 4: Prismaクライアント再生成**

Run: `bun run db:generate`
Expected: Prisma Client generated successfully

**Step 5: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 2: バリデーションスキーマ・型定義更新

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts`

**Step 1: PostCategoryスキーマにSEOフィールド追加**

`postCategorySchema` を以下に更新:

```typescript
import { seoOgpFieldsSchema } from '@/shared/lib/validations/seo'

/**
 * 投稿カテゴリスキーマ（基本情報）
 */
export const postCategoryBaseSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です').max(50, 'カテゴリ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(500).nullable().optional(),
  order: z.number().int().min(0).default(0),
})

/**
 * 投稿カテゴリスキーマ（SEO含む）
 */
export const postCategorySchema = postCategoryBaseSchema.merge(
  z.object({
    metaTitle: z.string().max(70).nullable().optional(),
    metaDescription: z.string().max(160).nullable().optional(),
    ogpImageUrl: z.string().url().nullable().optional().or(z.literal('')),
  })
)

export type PostCategoryInput = z.infer<typeof postCategorySchema>
```

**Step 2: PostTagスキーマにSEOフィールド追加**

```typescript
/**
 * 投稿タグスキーマ（基本情報）
 */
export const postTagBaseSchema = z.object({
  name: z.string().min(1, 'タグ名は必須です').max(50, 'タグ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
})

/**
 * 投稿タグスキーマ（SEO含む）
 */
export const postTagSchema = postTagBaseSchema.merge(
  z.object({
    description: z.string().max(500).nullable().optional(),
    metaTitle: z.string().max(70).nullable().optional(),
    metaDescription: z.string().max(160).nullable().optional(),
    ogpImageUrl: z.string().url().nullable().optional().or(z.literal('')),
  })
)

export type PostTagInput = z.infer<typeof postTagSchema>
```

**Step 3: 型定義更新**

`PostCategoryData` と `PostTagData` を更新:

```typescript
/**
 * 投稿カテゴリデータ型
 */
export type PostCategoryData = {
  id: string
  name: string
  slug: string
  description: string | null
  order: number
  metaTitle: string | null
  metaDescription: string | null
  ogpImageUrl: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    posts: number
  }
}

/**
 * 投稿タグデータ型
 */
export type PostTagData = {
  id: string
  name: string
  slug: string
  description: string | null
  metaTitle: string | null
  metaDescription: string | null
  ogpImageUrl: string | null
  createdAt: Date
  updatedAt: Date
  _count: {
    posts: number
  }
}
```

**Step 4: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 3: Server Actions更新

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts`

**Step 1: getPostCategoryById を更新してSEOフィールドを含める**

既存の `getPostCategoryById` 関数はすでに全フィールドを返しているため、Prismaスキーマ変更で自動的に含まれる。

**Step 2: getPostTagById を更新してSEOフィールドを含める**

既存の `getPostTagById` 関数を更新:

```typescript
export async function getPostTagById(id: string): Promise<PostTagData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const tag = await prisma.postTag.findUnique({
    where: { id },
  })

  if (!tag) return null

  const count = await prisma.post.count({
    where: {
      tags: { array_contains: [tag.name] },
    },
  })

  return {
    ...tag,
    _count: { posts: count },
  }
}
```

**Step 3: updatePostCategory を更新してSEOフィールドを処理**

既存の `updatePostCategory` は `postCategorySchema` を使用しているため、スキーマ更新で自動対応。

**Step 4: updatePostTag を更新してSEOフィールドを処理**

既存の `updatePostTag` は `postTagSchema` を使用しているため、スキーマ更新で自動対応。

**Step 5: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 4: カテゴリ編集ページ作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/posts/categories/[id]/page.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/posts/categories/_components/CategoryEditor.tsx`

**Step 1: ページコンポーネント作成**

`src/app/(admin)/admin/(dashboard)/posts/categories/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPostCategoryById } from '@/admin/actions/post'
import { CategoryEditor } from '../_components/CategoryEditor'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const category = await getPostCategoryById(id)
  return {
    title: category ? `${category.name} | カテゴリ編集` : 'カテゴリが見つかりません',
  }
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditCategoryPage({ params }: PageProps) {
  const { id } = await params
  const category = await getPostCategoryById(id)

  if (!category) {
    notFound()
  }

  return <CategoryEditor category={category} />
}
```

**Step 2: CategoryEditorコンポーネント作成**

`src/app/(admin)/admin/(dashboard)/posts/categories/_components/CategoryEditor.tsx`:

```typescript
'use client'

/**
 * カテゴリエディター
 *
 * カテゴリの基本情報とSEO/OGP設定を編集するUI
 */

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
  Textarea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import { SEOFields, OGPFields } from '@/admin/components/editor/inline/side-panel'
import { MediaPickerDialog, useSingleMediaPicker } from '@/admin/components/media-picker'
import { updatePostCategory } from '@/admin/actions/post'
import type { PostCategoryData } from '@/admin/lib/validations/post'
import { ArrowLeft, Image as ImageIcon, X } from 'lucide-react'

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です').max(50, 'カテゴリ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(500).optional(),
  order: z.number().int().min(0),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  ogpImageUrl: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// =============================================================================
// Types
// =============================================================================

type CategoryEditorProps = {
  category: PostCategoryData
}

// =============================================================================
// Component
// =============================================================================

export function CategoryEditor({ category }: CategoryEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: category.name,
      slug: category.slug,
      description: category.description ?? '',
      order: category.order,
      metaTitle: category.metaTitle ?? '',
      metaDescription: category.metaDescription ?? '',
      ogpImageUrl: category.ogpImageUrl ?? '',
    },
  })

  const ogpImageUrl = watch('ogpImageUrl')

  const mediaPicker = useSingleMediaPicker({
    defaultUsage: 'POST',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('ogpImageUrl', media[0].url, { shouldDirty: true })
      }
    },
  })

  const handleClearOgpImage = () => {
    setValue('ogpImageUrl', '', { shouldDirty: true })
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updatePostCategory(category.id, {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        order: data.order,
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
        ogpImageUrl: data.ogpImageUrl || null,
      })

      if (result.success) {
        reset(data)
        router.refresh()
        toast.success('カテゴリを更新しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/posts/taxonomy')
  }

  const generateSlug = () => {
    const name = watch('name')
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
      setValue('slug', slug, { shouldDirty: true })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Button>
            <div>
              <h1 className="text-lg font-semibold">{category.name}</h1>
              <p className="text-sm text-muted-foreground">
                カテゴリ編集 • {category._count.posts}件の記事
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isPending || !isDirty}
          >
            {isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-3xl py-8 px-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">基本情報</TabsTrigger>
              <TabsTrigger value="seo">SEO / OGP</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>基本情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">カテゴリ名 *</Label>
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
                      <Label htmlFor="slug">スラッグ *</Label>
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
                    <p className="text-xs text-muted-foreground">
                      URL: /posts/category/{watch('slug') || 'slug'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">説明</Label>
                    <Textarea
                      id="description"
                      {...register('description')}
                      placeholder="カテゴリの説明（アーカイブページに表示されます）"
                      rows={3}
                      disabled={isPending}
                    />
                    {errors.description && (
                      <p className="text-sm text-destructive">{errors.description.message}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seo" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>SEO設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="metaTitle">SEOタイトル</Label>
                      <Input
                        id="metaTitle"
                        {...register('metaTitle')}
                        placeholder="検索結果に表示されるタイトル（70文字以内推奨）"
                        disabled={isPending}
                      />
                      {errors.metaTitle && (
                        <p className="text-sm text-destructive">{errors.metaTitle.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        空の場合はカテゴリ名が使用されます
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="metaDescription">メタディスクリプション</Label>
                      <Textarea
                        id="metaDescription"
                        {...register('metaDescription')}
                        placeholder="検索結果に表示される説明文（160文字以内推奨）"
                        rows={3}
                        disabled={isPending}
                      />
                      {errors.metaDescription && (
                        <p className="text-sm text-destructive">{errors.metaDescription.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        空の場合はカテゴリ説明が使用されます
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>OGP設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>OGP画像</Label>
                      {ogpImageUrl ? (
                        <div className="relative inline-block">
                          <img
                            src={ogpImageUrl}
                            alt="OGP画像"
                            className="max-w-xs rounded-lg border"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -right-2 -top-2 h-6 w-6"
                            onClick={handleClearOgpImage}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => mediaPicker.openPicker()}
                          disabled={isPending}
                        >
                          <ImageIcon className="mr-2 h-4 w-4" />
                          画像を選択
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">
                        推奨サイズ: 1200x630px
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </div>

      <mediaPicker.MediaPicker />
    </div>
  )
}
```

**Step 3: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 5: タグ編集ページ作成

**Files:**
- Create: `src/app/(admin)/admin/(dashboard)/posts/tags/[id]/page.tsx`
- Create: `src/app/(admin)/admin/(dashboard)/posts/tags/_components/TagEditor.tsx`

**Step 1: ページコンポーネント作成**

`src/app/(admin)/admin/(dashboard)/posts/tags/[id]/page.tsx`:

```typescript
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'
import { getPostTagById } from '@/admin/actions/post'
import { TagEditor } from '../_components/TagEditor'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const tag = await getPostTagById(id)
  return {
    title: tag ? `${tag.name} | タグ編集` : 'タグが見つかりません',
  }
}

type PageProps = {
  params: Promise<{ id: string }>
}

export default async function EditTagPage({ params }: PageProps) {
  const { id } = await params
  const tag = await getPostTagById(id)

  if (!tag) {
    notFound()
  }

  return <TagEditor tag={tag} />
}
```

**Step 2: TagEditorコンポーネント作成**

`src/app/(admin)/admin/(dashboard)/posts/tags/_components/TagEditor.tsx`:

```typescript
'use client'

/**
 * タグエディター
 *
 * タグの基本情報とSEO/OGP設定を編集するUI
 */

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
  Textarea,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/admin/components/ui'
import { useSingleMediaPicker } from '@/admin/components/media-picker'
import { updatePostTag } from '@/admin/actions/post'
import type { PostTagData } from '@/admin/lib/validations/post'
import { ArrowLeft, Image as ImageIcon, X } from 'lucide-react'

// =============================================================================
// Schema
// =============================================================================

const formSchema = z.object({
  name: z.string().min(1, 'タグ名は必須です').max(50, 'タグ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(500).optional(),
  metaTitle: z.string().max(70).optional(),
  metaDescription: z.string().max(160).optional(),
  ogpImageUrl: z.string().optional(),
})

type FormData = z.infer<typeof formSchema>

// =============================================================================
// Types
// =============================================================================

type TagEditorProps = {
  tag: PostTagData
}

// =============================================================================
// Component
// =============================================================================

export function TagEditor({ tag }: TagEditorProps) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const {
    register,
    handleSubmit,
    setValue,
    watch,
    reset,
    formState: { errors, isDirty },
  } = useForm<FormData>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      name: tag.name,
      slug: tag.slug,
      description: tag.description ?? '',
      metaTitle: tag.metaTitle ?? '',
      metaDescription: tag.metaDescription ?? '',
      ogpImageUrl: tag.ogpImageUrl ?? '',
    },
  })

  const ogpImageUrl = watch('ogpImageUrl')

  const mediaPicker = useSingleMediaPicker({
    defaultUsage: 'POST',
    onSelect: (media) => {
      if (media.length > 0) {
        setValue('ogpImageUrl', media[0].url, { shouldDirty: true })
      }
    },
  })

  const handleClearOgpImage = () => {
    setValue('ogpImageUrl', '', { shouldDirty: true })
  }

  const onSubmit = (data: FormData) => {
    startTransition(async () => {
      const result = await updatePostTag(tag.id, {
        name: data.name,
        slug: data.slug,
        description: data.description || null,
        metaTitle: data.metaTitle || null,
        metaDescription: data.metaDescription || null,
        ogpImageUrl: data.ogpImageUrl || null,
      })

      if (result.success) {
        reset(data)
        router.refresh()
        toast.success('タグを更新しました')
      } else {
        toast.error(result.error)
      }
    })
  }

  const handleBack = () => {
    if (isDirty && !window.confirm('保存されていない変更があります。破棄してもよろしいですか？')) {
      return
    }
    router.push('/admin/posts/taxonomy')
  }

  const generateSlug = () => {
    const name = watch('name')
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
      setValue('slug', slug, { shouldDirty: true })
    }
  }

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="sticky top-0 z-10 border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60">
        <div className="container flex h-14 items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={handleBack}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              戻る
            </Button>
            <div>
              <h1 className="text-lg font-semibold">#{tag.name}</h1>
              <p className="text-sm text-muted-foreground">
                タグ編集 • {tag._count.posts}件の記事
              </p>
            </div>
          </div>
          <Button
            type="button"
            onClick={handleSubmit(onSubmit)}
            disabled={isPending || !isDirty}
          >
            {isPending ? '保存中...' : '保存'}
          </Button>
        </div>
      </div>

      {/* Content */}
      <div className="container max-w-3xl py-8 px-4">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          <Tabs defaultValue="basic" className="w-full">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="basic">基本情報</TabsTrigger>
              <TabsTrigger value="seo">SEO / OGP</TabsTrigger>
            </TabsList>

            <TabsContent value="basic" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>基本情報</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">タグ名 *</Label>
                    <Input
                      id="name"
                      {...register('name')}
                      placeholder="タグ名"
                      disabled={isPending}
                    />
                    {errors.name && (
                      <p className="text-sm text-destructive">{errors.name.message}</p>
                    )}
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="slug">スラッグ *</Label>
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
                      placeholder="tag-slug"
                      disabled={isPending}
                    />
                    {errors.slug && (
                      <p className="text-sm text-destructive">{errors.slug.message}</p>
                    )}
                    <p className="text-xs text-muted-foreground">
                      URL: /posts/tag/{watch('slug') || 'slug'}
                    </p>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="description">説明</Label>
                    <Textarea
                      id="description"
                      {...register('description')}
                      placeholder="タグの説明（アーカイブページに表示されます）"
                      rows={3}
                      disabled={isPending}
                    />
                    {errors.description && (
                      <p className="text-sm text-destructive">{errors.description.message}</p>
                    )}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

            <TabsContent value="seo" className="mt-6 space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle>SEO設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="metaTitle">SEOタイトル</Label>
                      <Input
                        id="metaTitle"
                        {...register('metaTitle')}
                        placeholder="検索結果に表示されるタイトル（70文字以内推奨）"
                        disabled={isPending}
                      />
                      {errors.metaTitle && (
                        <p className="text-sm text-destructive">{errors.metaTitle.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        空の場合はタグ名が使用されます
                      </p>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="metaDescription">メタディスクリプション</Label>
                      <Textarea
                        id="metaDescription"
                        {...register('metaDescription')}
                        placeholder="検索結果に表示される説明文（160文字以内推奨）"
                        rows={3}
                        disabled={isPending}
                      />
                      {errors.metaDescription && (
                        <p className="text-sm text-destructive">{errors.metaDescription.message}</p>
                      )}
                      <p className="text-xs text-muted-foreground">
                        空の場合はタグ説明が使用されます
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>OGP設定</CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>OGP画像</Label>
                      {ogpImageUrl ? (
                        <div className="relative inline-block">
                          <img
                            src={ogpImageUrl}
                            alt="OGP画像"
                            className="max-w-xs rounded-lg border"
                          />
                          <Button
                            type="button"
                            variant="destructive"
                            size="icon"
                            className="absolute -right-2 -top-2 h-6 w-6"
                            onClick={handleClearOgpImage}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          onClick={() => mediaPicker.openPicker()}
                          disabled={isPending}
                        >
                          <ImageIcon className="mr-2 h-4 w-4" />
                          画像を選択
                        </Button>
                      )}
                      <p className="text-xs text-muted-foreground">
                        推奨サイズ: 1200x630px
                      </p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        </form>
      </div>

      <mediaPicker.MediaPicker />
    </div>
  )
}
```

**Step 3: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 6: TaxonomyManager（一覧）から編集ページへのリンク追加

**Files:**
- Modify: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/CategoryManager.tsx`
- Modify: `src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/TagManager.tsx`

**Step 1: CategoryManagerの編集ボタンをリンクに変更**

`SortableCategoryRow` コンポーネント内の編集ボタンを変更:

```typescript
import Link from 'next/link'

// 編集ボタンを Link に変更
<Button
  variant="outline"
  size="sm"
  asChild
>
  <Link href={`/admin/posts/categories/${category.id}`}>
    編集
  </Link>
</Button>
```

**Step 2: TagManagerの編集ボタンをリンクに変更**

同様に TagManager の編集ボタンを Link に変更:

```typescript
import Link from 'next/link'

// 編集ボタンを Link に変更
<Button
  variant="outline"
  size="sm"
  asChild
>
  <Link href={`/admin/posts/tags/${tag.id}`}>
    編集
  </Link>
</Button>
```

**Step 3: 不要になったダイアログ関連コードを削除**

CategoryManager と TagManager から編集ダイアログ関連のコードを削除（新規作成ダイアログは残す）。

**Step 4: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 7: 公開ページのメタデータ改善

**Files:**
- Modify: `src/app/(public)/posts/category/[slug]/page.tsx`
- Modify: `src/app/(public)/posts/tag/[slug]/page.tsx`

**Step 1: カテゴリアーカイブページのメタデータ更新**

`generateMetadata` 関数を更新:

```typescript
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const category = await getCategoryBySlug(slug)

  if (!category) {
    return {
      title: 'カテゴリーが見つかりません',
    }
  }

  const title = category.metaTitle || `${category.name} - ブログ`
  const description = category.metaDescription || category.description || `${category.name}カテゴリーの記事一覧`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(category.ogpImageUrl && { images: [{ url: category.ogpImageUrl }] }),
    },
  }
}
```

`getCategoryBySlug` 関数を更新してSEOフィールドを含める:

```typescript
async function getCategoryBySlug(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POSTS)

  return prisma.postCategory.findUnique({
    where: { slug },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
    },
  })
}
```

**Step 2: タグアーカイブページのメタデータ更新**

`generateMetadata` 関数を更新:

```typescript
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params
  const decodedSlug = decodeURIComponent(slug)
  const tag = await getTagBySlugOrName(decodedSlug)

  if (!tag) {
    return {
      title: 'タグが見つかりません',
    }
  }

  const title = tag.metaTitle || `#${tag.name} - ブログ`
  const description = tag.metaDescription || tag.description || `${tag.name}タグが付いた記事一覧`

  return {
    title,
    description,
    openGraph: {
      title,
      description,
      ...(tag.ogpImageUrl && { images: [{ url: tag.ogpImageUrl }] }),
    },
  }
}
```

`getTagBySlugOrName` 関数を更新してSEOフィールドを含める:

```typescript
async function getTagBySlugOrName(slugOrName: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.POST_TAGS)

  return prisma.postTag.findFirst({
    where: {
      OR: [
        { slug: slugOrName },
        { name: slugOrName },
      ],
    },
    select: {
      id: true,
      name: true,
      slug: true,
      description: true,
      metaTitle: true,
      metaDescription: true,
      ogpImageUrl: true,
    },
  })
}
```

**Step 3: タグアーカイブページに説明表示追加**

ページコンポーネントを更新して説明を表示:

```typescript
{/* ヘッダー */}
<header className={styles.header()}>
  <h1 className={styles.title()}>#{tag.name}</h1>
  <p className={styles.subtitle()}>
    {tag.description || 'このタグが付いた記事一覧'}
  </p>
</header>
```

**Step 4: 型チェック**

Run: `bun run type-check`
Expected: No errors

---

## Task 8: テスト・検証

**Step 1: 型チェック**

Run: `bun run type-check`
Expected: No errors

**Step 2: Lint**

Run: `bun run lint`
Expected: No errors

**Step 3: ビルド**

Run: `bun run build`
Expected: Build successful

**Step 4: 動作確認**

1. 管理画面でカテゴリ一覧を表示
2. 「編集」ボタンをクリックして編集ページに遷移
3. SEO設定を入力して保存
4. タグ一覧で同様の操作
5. 公開ページでメタデータを確認（ページソース or DevTools）

---

## Task 9: コミット

**Step 1: 変更をステージング**

```bash
git add prisma/schema.prisma
git add src/app/(admin)/admin/(dashboard)/_shared/lib/validations/post.ts
git add src/app/(admin)/admin/(dashboard)/_shared/actions/post.ts
git add src/app/(admin)/admin/(dashboard)/posts/categories/
git add src/app/(admin)/admin/(dashboard)/posts/tags/
git add src/app/(admin)/admin/(dashboard)/posts/taxonomy/_components/
git add src/app/(public)/posts/category/
git add src/app/(public)/posts/tag/
git add prisma/migrations/
```

**Step 2: コミット**

```bash
git commit -m "$(cat <<'EOF'
feat(posts): add SEO settings for categories and tags

- Add metaTitle, metaDescription, ogpImageUrl fields to PostCategory
- Add description, metaTitle, metaDescription, ogpImageUrl fields to PostTag
- Create dedicated edit pages for categories (/admin/posts/categories/[id])
- Create dedicated edit pages for tags (/admin/posts/tags/[id])
- Update taxonomy list to link to edit pages instead of inline dialog
- Update public archive pages to use custom SEO settings
- Add OGP image support with MediaPicker integration

Co-Authored-By: Claude Opus 4.5 <noreply@anthropic.com>
EOF
)"
```

---

## まとめ

| タスク | 内容 |
|--------|------|
| Task 1 | Prismaスキーマ拡張（SEOフィールド追加） |
| Task 2 | バリデーション・型定義更新 |
| Task 3 | Server Actions更新 |
| Task 4 | カテゴリ編集ページ作成 |
| Task 5 | タグ編集ページ作成 |
| Task 6 | 一覧から編集ページへのリンク追加 |
| Task 7 | 公開ページのメタデータ改善 |
| Task 8 | テスト・検証 |
| Task 9 | コミット |
