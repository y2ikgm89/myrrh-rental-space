'use server'

import { prisma } from '@/shared/lib/prisma'
import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { createSuccess, createFailure } from '@/admin/types/server-actions'
import { withPermission } from '@/admin/lib/server-action-helpers'
import type { PostWhereInput } from '@/shared/types/prisma'
import { parseStringArray } from '@/shared/lib/json-validators'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { checkReadPermissionFor } from '@/admin/lib/permissions'
import { purgePostCache } from '@/shared/lib/cloudflare'
import { checkSlugAvailability, getSlugErrorMessage } from '@/shared/lib/slug-validation'

import {
  createPostSchema,
  updatePostSchema,
  postCategorySchema,
  postTagSchema,
  type PostData,
  type PostVersionData,
  type PostCategoryData,
  type PostTagData,
  type GetPostsResult,
  type PostFilters,
  type PostPagination,
  type CreatePostInput,
  type UpdatePostInput,
  type PostCategoryInput,
  type PostTagInput,
} from '@/admin/lib/validations/post'

// =============================================================================
// Helper Functions
// =============================================================================

const checkReadPermission = checkReadPermissionFor('post')

// =============================================================================
// Post Actions
// =============================================================================

/**
 * 投稿記事一覧を取得
 */
export async function getPosts(
  filters: PostFilters = {},
  pagination: PostPagination = {}
): Promise<GetPostsResult> {
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
  const where: PostWhereInput = {}

  if (status === 'PUBLISHED') {
    where.status = PostStatus.PUBLISHED
  } else if (status === 'DRAFT') {
    where.status = PostStatus.DRAFT
  } else if (status === 'ARCHIVED') {
    where.status = PostStatus.ARCHIVED
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
    prisma.post.count({ where }),
    prisma.post.findMany({
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
  const formattedPosts: PostData[] = posts.map((post) => ({
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
 * 投稿記事詳細を取得
 */
export async function getPostById(id: string): Promise<PostData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const post = await prisma.post.findUnique({
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
 * 投稿記事を作成
 */
export const createPost = withPermission<[CreatePostInput], { id: string }>(
  'post',
  'create'
)(async (user, data) => {
    const parsed = createPostSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断）
    const slugCheck = await checkSlugAvailability(parsed.data.slug, {
      currentType: 'post',
    })
    if (!slugCheck.available) {
      return createFailure(getSlugErrorMessage(slugCheck.reason))
    }

    const post = await prisma.post.create({
      data: {
        ...parsed.data,
        status: PostStatus.DRAFT,
        authorId: user.id,
      },
    })

    updateTag(CACHE_TAGS.POSTS)

    // Cloudflare CDN キャッシュパージ
    void purgePostCache(post.slug)

    return createSuccess('投稿記事を作成しました', { id: post.id })
  }
)

/**
 * 投稿記事を更新
 */
export const updatePost = withPermission<[string, UpdatePostInput], void>(
  'post',
  'update'
)(async (user, id, data) => {
    const parsed = updatePostSchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const existingPost = await prisma.post.findUnique({
      where: { id },
    })

    if (!existingPost) {
      return createFailure('投稿記事が見つかりません')
    }

    // スラッグの使用可能チェック（予約パス＋全コンテンツタイプ横断、自分自身は除外）
    const slugCheck = await checkSlugAvailability(parsed.data.slug, {
      currentType: 'post',
      currentId: id,
    })
    if (!slugCheck.available) {
      return createFailure(getSlugErrorMessage(slugCheck.reason))
    }

    const { contentWidth, contentWidthCustom, ...rest } = parsed.data

    // 旧 slug でのキャッシュ無効化のため、更新前の slug を保持
    const oldSlug = existingPost.slug

    await prisma.post.update({
      where: { id },
      data: {
        ...rest,
        contentWidth: contentWidth ?? null,
        contentWidthCustom: contentWidthCustom ?? null,
      },
    })

    updateTag(CACHE_TAGS.POSTS)
    // slug 変更時は両方を無効化
    updateTag(getCacheTag.posts.detail(oldSlug))
    if (parsed.data.slug !== oldSlug) {
      updateTag(getCacheTag.posts.detail(parsed.data.slug))
    }

    // Cloudflare CDN キャッシュパージ
    void purgePostCache(oldSlug)
    if (parsed.data.slug !== oldSlug) {
      void purgePostCache(parsed.data.slug)
    }

    return createSuccess('投稿記事を保存しました')
  }
)

/**
 * 投稿記事を削除
 */
export const deletePost = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, id) => {
    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('投稿記事が見つかりません')
    }

    await prisma.post.delete({
      where: { id },
    })

    updateTag(CACHE_TAGS.POSTS)
    updateTag(getCacheTag.posts.detail(post.slug))

    // Cloudflare CDN キャッシュパージ
    void purgePostCache(post.slug)

    return createSuccess('投稿記事を削除しました')
  }
)

/**
 * 投稿記事を公開（バージョン自動作成）
 */
export const publishPost = withPermission<[string], void>(
  'post',
  'publish'
)(async (user, id) => {
    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('投稿記事が見つかりません')
    }

    // 次のバージョン番号を取得
    const latestVersion = await prisma.postVersion.findFirst({
      where: { postId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latestVersion?.version ?? 0) + 1

    // トランザクションで公開 + バージョン作成
    await prisma.$transaction([
      prisma.post.update({
        where: { id },
        data: {
          status: PostStatus.PUBLISHED,
          publishedAt: post.publishedAt ?? new Date(),
        },
      }),
      prisma.postVersion.create({
        data: {
          postId: id,
          version: nextVersion,
          content: post.content,
          createdBy: user.id,
        },
      }),
    ])

    updateTag(CACHE_TAGS.POSTS)
    updateTag(getCacheTag.posts.detail(post.slug))

    // Cloudflare CDN キャッシュパージ
    void purgePostCache(post.slug)

    return createSuccess(`公開しました（バージョン ${nextVersion}）`)
  }
)

/**
 * 投稿記事を非公開（下書きに戻す）
 */
export const unpublishPost = withPermission<[string], void>(
  'post',
  'publish'
)(async (user, id) => {
    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('投稿記事が見つかりません')
    }

    await prisma.post.update({
      where: { id },
      data: {
        status: PostStatus.DRAFT,
      },
    })

    updateTag(CACHE_TAGS.POSTS)
    updateTag(getCacheTag.posts.detail(post.slug))

    // Cloudflare CDN キャッシュパージ
    void purgePostCache(post.slug)

    return createSuccess('下書きに戻しました')
  }
)

/**
 * バックアップを作成（バージョン手動作成）
 */
export const createPostBackup = withPermission<[string], { version: number }>(
  'post',
  'update'
)(async (user, id) => {
    const post = await prisma.post.findUnique({
      where: { id },
    })

    if (!post) {
      return createFailure('投稿記事が見つかりません')
    }

    // 次のバージョン番号を取得
    const latestVersion = await prisma.postVersion.findFirst({
      where: { postId: id },
      orderBy: { version: 'desc' },
      select: { version: true },
    })
    const nextVersion = (latestVersion?.version ?? 0) + 1

    await prisma.postVersion.create({
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
export async function getPostVersions(postId: string): Promise<PostVersionData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const versions = await prisma.postVersion.findMany({
    where: { postId },
    orderBy: { version: 'desc' },
  })

  return versions
}

/**
 * バージョンを復元
 */
export const restorePostVersion = withPermission<[string, number], void>(
  'post',
  'update'
)(async (user, postId, version) => {
    const [versionData, post] = await Promise.all([
      prisma.postVersion.findUnique({
        where: {
          postId_version: { postId, version },
        },
      }),
      prisma.post.findUnique({
        where: { id: postId },
        select: { slug: true },
      }),
    ])

    if (!versionData) {
      return createFailure('バージョンが見つかりません')
    }

    if (!post) {
      return createFailure('投稿記事が見つかりません')
    }

    await prisma.post.update({
      where: { id: postId },
      data: {
        content: versionData.content,
        status: PostStatus.DRAFT,
      },
    })

    updateTag(CACHE_TAGS.POSTS)
    updateTag(getCacheTag.posts.detail(post.slug))

    // Cloudflare CDN キャッシュパージ
    void purgePostCache(post.slug)

    return createSuccess(`バージョン ${version} を復元しました（下書き状態）`)
  }
)

// =============================================================================
// Post Category Actions
// =============================================================================

/**
 * カテゴリ一覧を取得
 */
export async function getPostCategories(): Promise<PostCategoryData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  const categories = await prisma.postCategory.findMany({
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
export async function getPostCategoryById(id: string): Promise<PostCategoryData | null> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return null
  }

  const category = await prisma.postCategory.findUnique({
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
export const createPostCategory = withPermission<[PostCategoryInput], { id: string }>(
  'post',
  'create'
)(async (user, data) => {
    const parsed = postCategorySchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    // スラッグの重複チェック
    const existingCategory = await prisma.postCategory.findUnique({
      where: { slug: parsed.data.slug },
    })
    if (existingCategory) {
      return createFailure('このスラッグは既に使用されています')
    }

    const category = await prisma.postCategory.create({
      data: parsed.data,
    })

    // カテゴリ変更時は投稿一覧のキャッシュも無効化
    updateTag(CACHE_TAGS.POSTS)

    // Cloudflare CDN キャッシュパージ（カテゴリ一覧に影響）
    void purgePostCache()

    return createSuccess('カテゴリを作成しました', { id: category.id })
  }
)

/**
 * カテゴリを更新
 */
export const updatePostCategory = withPermission<[string, PostCategoryInput], void>(
  'post',
  'update'
)(async (user, id, data) => {
    const parsed = postCategorySchema.safeParse(data)
    if (!parsed.success) {
      return createFailure(parsed.error.issues[0].message)
    }

    const existingCategory = await prisma.postCategory.findUnique({
      where: { id },
    })

    if (!existingCategory) {
      return createFailure('カテゴリが見つかりません')
    }

    // スラッグの重複チェック（自分以外）
    const duplicateSlug = await prisma.postCategory.findFirst({
      where: {
        slug: parsed.data.slug,
        id: { not: id },
      },
    })
    if (duplicateSlug) {
      return createFailure('このスラッグは既に使用されています')
    }

    await prisma.postCategory.update({
      where: { id },
      data: parsed.data,
    })

    // カテゴリ変更時は投稿一覧のキャッシュも無効化
    updateTag(CACHE_TAGS.POSTS)

    // Cloudflare CDN キャッシュパージ（カテゴリ一覧に影響）
    void purgePostCache()

    return createSuccess('カテゴリを更新しました')
  }
)

/**
 * カテゴリを削除
 */
export const deletePostCategory = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, id) => {
    const category = await prisma.postCategory.findUnique({
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

    await prisma.postCategory.delete({
      where: { id },
    })

    // カテゴリ変更時は投稿一覧のキャッシュも無効化
    updateTag(CACHE_TAGS.POSTS)

    // Cloudflare CDN キャッシュパージ（カテゴリ一覧に影響）
    void purgePostCache()

    return createSuccess('カテゴリを削除しました')
  }
)

/**
 * 投稿カテゴリの順序を更新
 */
export const updatePostCategoryOrder = withPermission<[{ id: string; order: number }[]], void>(
  'post',
  'update'
)(async (user, items) => {
    await prisma.$transaction(
      items.map((item) =>
        prisma.postCategory.update({
          where: { id: item.id },
          data: { order: item.order },
        })
      )
    )

    // カテゴリ順序変更時は投稿一覧のキャッシュも無効化
    updateTag(CACHE_TAGS.POSTS)

    // Cloudflare CDN キャッシュパージ（カテゴリ一覧に影響）
    void purgePostCache()

    return createSuccess('順序を更新しました')
  }
)

// =============================================================================
// Public Functions (認証不要)
// =============================================================================

export type PublicPost = {
  id: string
  title: string
  slug: string
  excerpt: string
  thumbnailUrl: string
  publishedAt: Date
}

export type GetPublishedPostsOptions = {
  take?: number
  orderBy?: 'publishedAt' | 'viewCount'
  categoryId?: string
}

/**
 * 公開済み投稿記事一覧を取得（認証不要）
 * ホームページや公開一覧ページで使用
 */
export async function getPublishedPosts(
  options: GetPublishedPostsOptions = {}
): Promise<PublicPost[]> {
  const { take = 3, orderBy = 'publishedAt', categoryId } = options

  const posts = await prisma.post.findMany({
    where: {
      status: PostStatus.PUBLISHED,
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

// =============================================================================
// Post Tag Actions
// =============================================================================

/**
 * タグ一覧を取得
 * N+1問題を回避: 全記事のタグを一度に取得してメモリ上で集計
 */
export async function getPostTags(): Promise<PostTagData[]> {
  const hasPermission = await checkReadPermission()
  if (!hasPermission) {
    return []
  }

  // タグと記事を並列取得（2クエリのみ）
  const [tags, posts] = await Promise.all([
    prisma.postTag.findMany({
      orderBy: { name: 'asc' },
    }),
    prisma.post.findMany({
      select: { tags: true },
    }),
  ])

  // メモリ上でタグごとの使用回数を集計
  const tagCountMap = new Map<string, number>()
  for (const post of posts) {
    const postTags = parseStringArray(post.tags)
    for (const tagName of postTags) {
      tagCountMap.set(tagName, (tagCountMap.get(tagName) || 0) + 1)
    }
  }

  return tags.map((tag) => ({
    ...tag,
    _count: { posts: tagCountMap.get(tag.name) || 0 },
  }))
}

/**
 * タグ詳細を取得
 */
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

/**
 * タグを作成
 */
export const createPostTag = withPermission<[PostTagInput], { id: string }>(
  'post',
  'create'
)(async (user, data) => {
  const parsed = postTagSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // 名前の重複チェック
  const existingName = await prisma.postTag.findUnique({
    where: { name: parsed.data.name },
  })
  if (existingName) {
    return createFailure('このタグ名は既に使用されています')
  }

  // スラッグの重複チェック
  const existingSlug = await prisma.postTag.findUnique({
    where: { slug: parsed.data.slug },
  })
  if (existingSlug) {
    return createFailure('このスラッグは既に使用されています')
  }

  const tag = await prisma.postTag.create({
    data: parsed.data,
  })

  updateTag(CACHE_TAGS.POST_TAGS)

  return createSuccess('タグを作成しました', { id: tag.id })
})

/**
 * タグを更新
 */
export const updatePostTag = withPermission<[string, PostTagInput], void>(
  'post',
  'update'
)(async (user, id, data) => {
  const parsed = postTagSchema.safeParse(data)
  if (!parsed.success) {
    return createFailure(parsed.error.issues[0].message)
  }

  // 既存タグと重複チェックを並列実行
  const [existingTag, duplicates] = await Promise.all([
    prisma.postTag.findUnique({
      where: { id },
      select: { id: true, name: true },
    }),
    // 名前またはスラッグの重複を一度に検索
    prisma.postTag.findFirst({
      where: {
        id: { not: id },
        OR: [
          { name: parsed.data.name },
          { slug: parsed.data.slug },
        ],
      },
      select: { name: true, slug: true },
    }),
  ])

  if (!existingTag) {
    return createFailure('タグが見つかりません')
  }

  // 重複エラーの詳細メッセージ
  if (duplicates) {
    if (duplicates.name === parsed.data.name) {
      return createFailure('このタグ名は既に使用されています')
    }
    return createFailure('このスラッグは既に使用されています')
  }

  // タグ名が変更された場合、関連する記事のtagsも更新
  if (existingTag.name !== parsed.data.name) {
    // インタラクティブトランザクションで一括更新
    await prisma.$transaction(async (tx) => {
      // タグを更新
      await tx.postTag.update({
        where: { id },
        data: parsed.data,
      })

      // 影響を受ける記事を取得
      const postsWithTag = await tx.post.findMany({
        where: {
          tags: { array_contains: [existingTag.name] },
        },
        select: { id: true, tags: true },
      })

      // 記事のタグを一括更新（Promise.allで並列実行）
      if (postsWithTag.length > 0) {
        await Promise.all(
          postsWithTag.map((post) => {
            const tags = parseStringArray(post.tags)
            const updatedTags = tags.map((t) =>
              t === existingTag.name ? parsed.data.name : t
            )
            return tx.post.update({
              where: { id: post.id },
              data: { tags: updatedTags },
            })
          })
        )
      }
    })
  } else {
    await prisma.postTag.update({
      where: { id },
      data: parsed.data,
    })
  }

  // タグと関連記事のキャッシュを無効化
  updateTag(CACHE_TAGS.POSTS)
  updateTag(CACHE_TAGS.POST_TAGS)

  // Cloudflare CDN キャッシュパージ（タグ一覧に影響）
  void purgePostCache()

  return createSuccess('タグを更新しました')
})

/**
 * タグを削除
 */
export const deletePostTag = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, id) => {
  const tag = await prisma.postTag.findUnique({
    where: { id },
    select: { id: true, name: true },
  })

  if (!tag) {
    return createFailure('タグが見つかりません')
  }

  // タグを使用している記事が存在するかチェック（findFirstで効率化）
  const postUsingTag = await prisma.post.findFirst({
    where: {
      tags: { array_contains: [tag.name] },
    },
    select: { id: true },
  })

  if (postUsingTag) {
    return createFailure('このタグは記事で使用されているため削除できません')
  }

  await prisma.postTag.delete({
    where: { id },
  })

  updateTag(CACHE_TAGS.POST_TAGS)

  return createSuccess('タグを削除しました')
})
