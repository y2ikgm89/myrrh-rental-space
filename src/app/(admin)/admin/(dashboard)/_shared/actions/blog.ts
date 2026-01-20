'use server'

import { prisma } from '@/shared/lib/prisma'
import { revalidateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { createSuccess, createFailure, withPermission } from '@/admin/types/server-actions'
import type { BlogPostWhereInput } from '@/shared/types/prisma'
import { parseStringArray } from '@/shared/lib/json-validators'
import { BlogPostStatus } from '@/shared/generated/prisma/enums'
import { checkReadPermissionFor } from '@/admin/lib/permissions'

// Types and schemas from centralized validation file
import {
  createBlogPostSchema,
  updateBlogPostSchema,
  blogCategorySchema,
  type BlogPostData,
  type BlogPostVersionData,
  type BlogCategoryData,
  type GetBlogPostsResult,
  type BlogPostFilters,
  type BlogPostPagination,
  type CreateBlogPostInput,
  type UpdateBlogPostInput,
  type BlogCategoryInput,
} from '@/admin/lib/validations/blog'

// Re-export types for consumers
export type {
  BlogPostData,
  BlogPostVersionData,
  BlogCategoryData,
  GetBlogPostsResult,
  BlogPostFilters,
  BlogPostPagination,
  CreateBlogPostInput,
  UpdateBlogPostInput,
  BlogCategoryInput,
} from '@/admin/lib/validations/blog'

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('blog')

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
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return { posts: [], total: 0, page: 1, limit: 10, totalPages: 0 }
  }

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
    where.status = BlogPostStatus.PUBLISHED
  } else if (status === 'DRAFT') {
    where.status = BlogPostStatus.DRAFT
  } else if (status === 'ARCHIVED') {
    where.status = BlogPostStatus.ARCHIVED
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

  // 総件数と記事一覧を並列取得（N+1解消）
  const [total, posts] = await prisma.$transaction([
    prisma.blogPost.count({ where }),
    prisma.blogPost.findMany({
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
    }),
  ])

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
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

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
export const createBlogPost = withPermission<[CreateBlogPostInput], { id: string }>(
  'blog',
  'create'
)(async (user, data) => {
    const parsed = createBlogPostSchema.safeParse(data)
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

    const post = await prisma.blogPost.create({
      data: {
        ...parsed.data,
        status: BlogPostStatus.DRAFT,
        authorId: user.id,
      },
    })

    revalidateTag(CACHE_TAGS.BLOG, 'default')

    return createSuccess('ブログ記事を作成しました', { id: post.id })
  }
)

/**
 * ブログ記事を更新
 */
export const updateBlogPost = withPermission<[string, UpdateBlogPostInput], void>(
  'blog',
  'update'
)(async (user, id, data) => {
    const parsed = updateBlogPostSchema.safeParse(data)
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

    const { contentWidth, contentWidthCustom, ...rest } = parsed.data

    // 旧 slug でのキャッシュ無効化のため、更新前の slug を保持
    const oldSlug = existingPost.slug

    await prisma.blogPost.update({
      where: { id },
      data: {
        ...rest,
        contentWidth: contentWidth ?? null,
        contentWidthCustom: contentWidthCustom ?? null,
      },
    })

    revalidateTag(CACHE_TAGS.BLOG, 'default')
    // slug 変更時は両方を無効化
    revalidateTag(getCacheTag.blog.detail(oldSlug), 'default')
    if (parsed.data.slug !== oldSlug) {
      revalidateTag(getCacheTag.blog.detail(parsed.data.slug), 'default')
    }

    return createSuccess('ブログ記事を保存しました')
  }
)

/**
 * ブログ記事を削除
 */
export const deleteBlogPost = withPermission<[string], void>(
  'blog',
  'delete'
)(async (user, id) => {
    const post = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    await prisma.blogPost.delete({
      where: { id },
    })

    revalidateTag(CACHE_TAGS.BLOG, 'default')
    revalidateTag(getCacheTag.blog.detail(post.slug), 'default')

    return createSuccess('ブログ記事を削除しました')
  }
)

/**
 * ブログ記事を公開（バージョン自動作成）
 */
export const publishBlogPost = withPermission<[string], void>(
  'blog',
  'publish'
)(async (user, id) => {
    const post = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    // 次のバージョン番号を取得
    const latestVersion = await prisma.blogPostVersion.findFirst({
      where: { postId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latestVersion?.version ?? 0) + 1

    // トランザクションで公開 + バージョン作成
    await prisma.$transaction([
      prisma.blogPost.update({
        where: { id },
        data: {
          status: BlogPostStatus.PUBLISHED,
          publishedAt: post.publishedAt ?? new Date(),
        },
      }),
      prisma.blogPostVersion.create({
        data: {
          postId: id,
          version: nextVersion,
          content: post.content,
          createdBy: user.id,
        },
      }),
    ])

    revalidateTag(CACHE_TAGS.BLOG, 'default')
    revalidateTag(getCacheTag.blog.detail(post.slug), 'default')

    return createSuccess(`公開しました（バージョン ${nextVersion}）`)
  }
)

/**
 * ブログ記事を非公開（下書きに戻す）
 */
export const unpublishBlogPost = withPermission<[string], void>(
  'blog',
  'publish'
)(async (user, id) => {
    const post = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    await prisma.blogPost.update({
      where: { id },
      data: {
        status: BlogPostStatus.DRAFT,
      },
    })

    revalidateTag(CACHE_TAGS.BLOG, 'default')
    revalidateTag(getCacheTag.blog.detail(post.slug), 'default')

    return createSuccess('下書きに戻しました')
  }
)

/**
 * バックアップを作成（バージョン手動作成）
 */
export const createBlogPostBackup = withPermission<[string], { version: number }>(
  'blog',
  'update'
)(async (user, id) => {
    const post = await prisma.blogPost.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    // 次のバージョン番号を取得
    const latestVersion = await prisma.blogPostVersion.findFirst({
      where: { postId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latestVersion?.version ?? 0) + 1

    await prisma.blogPostVersion.create({
      data: {
        postId: id,
        version: nextVersion,
        content: post.content,
        createdBy: user.id,
      },
    })

    return createSuccess(`バックアップを作成しました（バージョン ${nextVersion}）`, { version: nextVersion })
  }
)

/**
 * バージョン履歴を取得
 */
export async function getBlogPostVersions(postId: string): Promise<BlogPostVersionData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const versions = await prisma.blogPostVersion.findMany({
    where: { postId },
    orderBy: { version: 'desc' },
  })

  return versions
}

/**
 * バージョンを復元
 */
export const restoreBlogPostVersion = withPermission<[string, number], void>(
  'blog',
  'update'
)(async (user, postId, version) => {
    const [versionData, post] = await Promise.all([
      prisma.blogPostVersion.findUnique({
        where: {
          postId_version: { postId, version },
        },
      }),
      prisma.blogPost.findUnique({
        where: { id: postId },
        select: { slug: true },
      }),
    ])

    if (!versionData) {
      return createFailure('バージョンが見つかりません')
    }

    if (!post) {
      return createFailure('ブログ記事が見つかりません')
    }

    await prisma.blogPost.update({
      where: { id: postId },
      data: {
        content: versionData.content,
        status: BlogPostStatus.DRAFT,
      },
    })

    revalidateTag(CACHE_TAGS.BLOG, 'default')
    revalidateTag(getCacheTag.blog.detail(post.slug), 'default')

    return createSuccess(`バージョン ${version} を復元しました（下書き状態）`)
  }
)

// =============================================================================
// Blog Category Actions
// =============================================================================

/**
 * カテゴリ一覧を取得
 */
export async function getBlogCategories(): Promise<BlogCategoryData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

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
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

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
export const createBlogCategory = withPermission<[BlogCategoryInput], { id: string }>(
  'blog',
  'create'
)(async (user, data) => {
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

    // カテゴリ変更時はブログ一覧のキャッシュも無効化
    revalidateTag(CACHE_TAGS.BLOG, 'default')

    return createSuccess('カテゴリを作成しました', { id: category.id })
  }
)

/**
 * カテゴリを更新
 */
export const updateBlogCategory = withPermission<[string, BlogCategoryInput], void>(
  'blog',
  'update'
)(async (user, id, data) => {
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

    // カテゴリ変更時はブログ一覧のキャッシュも無効化
    revalidateTag(CACHE_TAGS.BLOG, 'default')

    return createSuccess('カテゴリを更新しました')
  }
)

/**
 * カテゴリを削除
 */
export const deleteBlogCategory = withPermission<[string], void>(
  'blog',
  'delete'
)(async (user, id) => {
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

    // カテゴリ変更時はブログ一覧のキャッシュも無効化
    revalidateTag(CACHE_TAGS.BLOG, 'default')

    return createSuccess('カテゴリを削除しました')
  }
)

/**
 * ブログカテゴリの順序を更新
 */
export const updateBlogCategoryOrder = withPermission<[{ id: string; order: number }[]], void>(
  'blog',
  'update'
)(async (user, items) => {
    await prisma.$transaction(
      items.map((item) =>
        prisma.blogCategory.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    )

    // カテゴリ順序変更時はブログ一覧のキャッシュも無効化
    revalidateTag(CACHE_TAGS.BLOG, 'default')

    return createSuccess('順序を更新しました')
  }
)

// =============================================================================
// Public Functions (認証不要)
// =============================================================================

export type PublicBlogPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  thumbnailUrl: string
  publishedAt: Date
}

export type GetPublishedBlogPostsOptions = {
  take?: number
  orderBy?: 'publishedAt' | 'viewCount'
  categoryId?: string
}

/**
 * 公開済みブログ記事一覧を取得（認証不要）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedBlogPosts(
  options: GetPublishedBlogPostsOptions = {}
): Promise<PublicBlogPost[]> {
  const { take = 3, orderBy = 'publishedAt', categoryId } = options

  const posts = await prisma.blogPost.findMany({
    where: {
      status: BlogPostStatus.PUBLISHED,
      publishedAt: { not: null },
      ...(categoryId && { categoryId }),
    },
    select: {
      id: true,
      title: true,
      slug: true,
      excerpt: true,
      thumbnailUrl: true,
      publishedAt: true,
    },
    orderBy: {
      [orderBy]: 'desc',
    },
    take,
  })

  return posts
    .filter((post) => post.publishedAt && post.publishedAt <= new Date())
    .map((post) => ({
      ...post,
      publishedAt: post.publishedAt!,
    }))
}
