'use server'

import { prisma } from '@/lib/prisma'
import { revalidatePath } from 'next/cache'
import { z } from 'zod'
import { requireAdmin } from '@/lib/auth'
import { type ActionResult, createSuccess, createFailure, type BlogPostWhereInput } from '@/types'
import { parseStringArray } from '@/lib/json-validators'
import { determinePublishedAt } from '@/lib/utils'

// =============================================================================
// Types
// =============================================================================

export type BlogPostData = {
  id: string
  title: string
  slug: string
  excerpt: string
  content: string
  thumbnailUrl: string
  ogpImageUrl: string | null
  categoryId: string
  tags: string[]
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  publishedAt: Date | null
  isPublished: boolean
  isDraft: boolean
  viewCount: number
  createdAt: Date
  updatedAt: Date
  category: {
    id: string
    name: string
    slug: string
  }
  author: {
    id: string
    name: string | null
    email: string
  }
}

export type BlogCategoryData = {
  id: string
  name: string
  slug: string
  description: string | null
  order: number
  createdAt: Date
  updatedAt: Date
  _count: {
    posts: number
  }
}

export type GetBlogPostsResult = {
  posts: BlogPostData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type BlogPostFilters = {
  status?: 'ALL' | 'PUBLISHED' | 'DRAFT'
  categoryId?: string
  search?: string
}

export type BlogPostPagination = {
  page?: number
  limit?: number
  sortBy?: 'createdAt' | 'publishedAt' | 'viewCount'
  sortOrder?: 'asc' | 'desc'
}

// =============================================================================
// Schemas
// =============================================================================

const blogPostSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(200, 'タイトルは200文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(200).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  excerpt: z.string().min(1, '抜粋は必須です').max(500, '抜粋は500文字以内'),
  content: z.string().min(1, '本文は必須です'),
  thumbnailUrl: z.string().min(1, 'サムネイルURLは必須です'),
  ogpImageUrl: z.string().nullable().optional(),
  categoryId: z.string().uuid('カテゴリを選択してください'),
  tags: z.array(z.string()).default([]),
  metaDescription: z.string().max(160).nullable().optional(),
  metaKeywords: z.string().nullable().optional(),
  ogpTitle: z.string().max(60).nullable().optional(),
  ogpDescription: z.string().max(160).nullable().optional(),
  isPublished: z.boolean(),
  publishedAt: z.string().nullable().optional(),
})

const blogCategorySchema = z.object({
  name: z.string().min(1, 'カテゴリ名は必須です').max(50, 'カテゴリ名は50文字以内'),
  slug: z.string().min(1, 'スラッグは必須です').max(50).regex(/^[a-z0-9-]+$/, 'スラッグは小文字英数字とハイフンのみ'),
  description: z.string().max(200).nullable().optional(),
  order: z.number().int().min(0).default(0),
})

export type BlogPostInput = z.infer<typeof blogPostSchema>
export type BlogCategoryInput = z.infer<typeof blogCategorySchema>

// =============================================================================
// Blog Post Actions
// =============================================================================

/**
 * ブログ記事一覧を取得
 */
export async function getBlogPosts(
  filters: BlogPostFilters = {},
  pagination: BlogPostPagination = {}
): Promise<GetBlogPostsResult> {
  await requireAdmin()

  const { status, categoryId, search } = filters

  const {
    page = 1,
    limit = 10,
    sortBy = 'createdAt',
    sortOrder = 'desc',
  } = pagination

  // Where条件を構築
  const where: BlogPostWhereInput = {}

  if (status === 'PUBLISHED') {
    where.isPublished = true
  } else if (status === 'DRAFT') {
    where.isDraft = true
  }

  if (categoryId) {
    where.categoryId = categoryId
  }

  if (search) {
    where.OR = [
      { title: { contains: search, mode: 'insensitive' } },
      { excerpt: { contains: search, mode: 'insensitive' } },
      { content: { contains: search, mode: 'insensitive' } },
    ]
  }

  // 総件数を取得
  const total = await prisma.blogPost.count({ where })

  // ブログ記事一覧を取得
  const posts = await prisma.blogPost.findMany({
    where,
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
    orderBy: {
      [sortBy]: sortOrder,
    },
    skip: (page - 1) * limit,
    take: limit,
  })

  // tags の型変換
  const formattedPosts: BlogPostData[] = posts.map((post) => ({
    ...post,
    tags: parseStringArray(post.tags),
  }))

  return {
    posts: formattedPosts,
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  }
}

/**
 * ブログ記事詳細を取得
 */
export async function getBlogPostById(id: string): Promise<BlogPostData | null> {
  await requireAdmin()

  const post = await prisma.blogPost.findUnique({
    where: { id },
    include: {
      category: {
        select: {
          id: true,
          name: true,
          slug: true,
        },
      },
      author: {
        select: {
          id: true,
          name: true,
          email: true,
        },
      },
    },
  })

  if (!post) return null

  return {
    ...post,
    tags: parseStringArray(post.tags),
  }
}

/**
 * ブログ記事を作成
 */
export async function createBlogPost(
  data: BlogPostInput
): Promise<ActionResult<{ id: string }>> {
  try {
    const user = await requireAdmin()

    const parsed = blogPostSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    // スラッグの重複チェック
    const existingPost = await prisma.blogPost.findUnique({
      where: { slug: parsed.data.slug },
    })
    if (existingPost) {
      return createFailure('このスラッグは既に使用されています')
    }

    const { isPublished, publishedAt, ...rest } = parsed.data

    const post = await prisma.blogPost.create({
      data: {
        ...rest,
        isPublished,
        isDraft: !isPublished,
        publishedAt: determinePublishedAt(publishedAt, isPublished),
        authorId: user.id,
      },
    })

    revalidatePath('/admin/blog')
    revalidatePath('/blog')

    return createSuccess('ブログ記事を作成しました', { id: post.id })
  } catch (error) {
    console.error('Failed to create blog post:', error)
    return createFailure('ブログ記事の作成に失敗しました')
  }
}

/**
 * ブログ記事を更新
 */
export async function updateBlogPost(
  id: string,
  data: BlogPostInput
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const parsed = blogPostSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const existingPost = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!existingPost) {
      return createFailure('ブログ記事が見つかりません')
    }

    // スラッグの重複チェック（自分以外）
    const duplicateSlug = await prisma.blogPost.findFirst({
      where: {
        slug: parsed.data.slug,
        id: { not: id },
      },
    })
    if (duplicateSlug) {
      return createFailure('このスラッグは既に使用されています')
    }

    const { isPublished, publishedAt, ...rest } = parsed.data

    await prisma.blogPost.update({
      where: { id },
      data: {
        ...rest,
        isPublished,
        isDraft: !isPublished,
        publishedAt: determinePublishedAt(publishedAt, isPublished, existingPost.publishedAt),
      },
    })

    revalidatePath('/admin/blog')
    revalidatePath(`/admin/blog/${id}`)
    revalidatePath('/blog')
    revalidatePath(`/blog/${parsed.data.slug}`)

    return createSuccess('ブログ記事を更新しました')
  } catch (error) {
    console.error('Failed to update blog post:', error)
    return createFailure('ブログ記事の更新に失敗しました')
  }
}

/**
 * ブログ記事を削除
 */
export async function deleteBlogPost(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const post = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    await prisma.blogPost.delete({
      where: { id },
    })

    revalidatePath('/admin/blog')
    revalidatePath('/blog')

    return createSuccess('ブログ記事を削除しました')
  } catch (error) {
    console.error('Failed to delete blog post:', error)
    return createFailure('ブログ記事の削除に失敗しました')
  }
}

/**
 * 公開状態を切り替え
 */
export async function toggleBlogPostPublish(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const post = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    const newIsPublished = !post.isPublished

    await prisma.blogPost.update({
      where: { id },
      data: {
        isPublished: newIsPublished,
        isDraft: !newIsPublished,
        publishedAt: newIsPublished && !post.publishedAt ? new Date() : post.publishedAt,
      },
    })

    revalidatePath('/admin/blog')
    revalidatePath(`/admin/blog/${id}`)
    revalidatePath('/blog')

    return createSuccess('公開状態を変更しました')
  } catch (error) {
    console.error('Failed to toggle blog post publish status:', error)
    return createFailure('公開状態の変更に失敗しました')
  }
}

// =============================================================================
// Blog Category Actions
// =============================================================================

/**
 * カテゴリ一覧を取得
 */
export async function getBlogCategories(): Promise<BlogCategoryData[]> {
  await requireAdmin()

  const categories = await prisma.blogCategory.findMany({
    include: {
      _count: {
        select: { posts: true },
      },
    },
    orderBy: { order: 'asc' },
  })

  return categories
}

/**
 * カテゴリ詳細を取得
 */
export async function getBlogCategoryById(id: string): Promise<BlogCategoryData | null> {
  await requireAdmin()

  const category = await prisma.blogCategory.findUnique({
    where: { id },
    include: {
      _count: {
        select: { posts: true },
      },
    },
  })

  return category
}

/**
 * カテゴリを作成
 */
export async function createBlogCategory(
  data: BlogCategoryInput
): Promise<ActionResult<{ id: string }>> {
  try {
    await requireAdmin()

    const parsed = blogCategorySchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    // スラッグの重複チェック
    const existingCategory = await prisma.blogCategory.findUnique({
      where: { slug: parsed.data.slug },
    })
    if (existingCategory) {
      return createFailure('このスラッグは既に使用されています')
    }

    const category = await prisma.blogCategory.create({
      data: parsed.data,
    })

    revalidatePath('/admin/blog/categories')
    revalidatePath('/admin/blog')

    return createSuccess('カテゴリを作成しました', { id: category.id })
  } catch (error) {
    console.error('Failed to create blog category:', error)
    return createFailure('カテゴリの作成に失敗しました')
  }
}

/**
 * カテゴリを更新
 */
export async function updateBlogCategory(
  id: string,
  data: BlogCategoryInput
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const parsed = blogCategorySchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const existingCategory = await prisma.blogCategory.findUnique({
      where: { id },
    })

    if (!existingCategory) {
      return createFailure('カテゴリが見つかりません')
    }

    // スラッグの重複チェック（自分以外）
    const duplicateSlug = await prisma.blogCategory.findFirst({
      where: {
        slug: parsed.data.slug,
        id: { not: id },
      },
    })
    if (duplicateSlug) {
      return createFailure('このスラッグは既に使用されています')
    }

    await prisma.blogCategory.update({
      where: { id },
      data: parsed.data,
    })

    revalidatePath('/admin/blog/categories')
    revalidatePath('/admin/blog')

    return createSuccess('カテゴリを更新しました')
  } catch (error) {
    console.error('Failed to update blog category:', error)
    return createFailure('カテゴリの更新に失敗しました')
  }
}

/**
 * カテゴリを削除
 */
export async function deleteBlogCategory(
  id: string
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    const category = await prisma.blogCategory.findUnique({
      where: { id },
      include: {
        _count: {
          select: { posts: true },
        },
      },
    })

    if (!category) {
      return createFailure('カテゴリが見つかりません')
    }

    if (category._count.posts > 0) {
      return createFailure('このカテゴリには記事が紐づいているため削除できません')
    }

    await prisma.blogCategory.delete({
      where: { id },
    })

    revalidatePath('/admin/blog/categories')
    revalidatePath('/admin/blog')

    return createSuccess('カテゴリを削除しました')
  } catch (error) {
    console.error('Failed to delete blog category:', error)
    return createFailure('カテゴリの削除に失敗しました')
  }
}

/**
 * ブログカテゴリの順序を更新
 */
export async function updateBlogCategoryOrder(
  items: { id: string; order: number }[]
): Promise<ActionResult<void>> {
  try {
    await requireAdmin()

    await prisma.$transaction(
      items.map((item) =>
        prisma.blogCategory.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    )

    revalidatePath('/admin/blog/categories')
    revalidatePath('/admin/blog')
    revalidatePath('/')

    return createSuccess('順序を更新しました')
  } catch (error) {
    console.error('Failed to update blog category order:', error)
    return createFailure('順序の更新に失敗しました')
  }
}
