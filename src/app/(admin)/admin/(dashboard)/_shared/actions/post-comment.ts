'use server'

/**
 * 投稿コメント管理 Server Actions（管理側）
 *
 * 管理画面での投稿コメント操作を提供するServer Actions。
 * コメントの一覧取得、削除、一括削除、復元などを行います。
 *
 * ## 主な機能
 * - コメント一覧取得（フィルタ・ページネーション対応）
 * - コメント統計取得
 * - コメント削除（論理削除）
 * - コメント一括削除
 * - コメント復元
 * - コメント数取得
 *
 * @module admin/actions/post-comment
 */

import { updateTag } from 'next/cache'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { verifyAdminSession } from '@/shared/lib/auth'
import { toCommentAuthor, type CommentAuthor } from '@/shared/lib/validations/comment'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure } from '@/admin/types/server-actions'

// ==============================================
// Types
// ==============================================

export type AdminCommentData = {
  id: string
  content: string
  author: CommentAuthor
  postId: string
  postTitle: string
  postSlug: string
  parentCommentId: string | null
  isDeleted: boolean
  deletedAt: Date | null
  createdAt: Date
}

export type GetCommentsResult = {
  comments: AdminCommentData[]
  total: number
  page: number
  limit: number
  totalPages: number
}

export type CommentFilters = {
  postId?: string
  status?: 'ALL' | 'ACTIVE' | 'DELETED'
  search?: string
}

export type CommentStats = {
  total: number
  today: number
  deleted: number
}

// ==============================================
// Helper Functions
// ==============================================

function toAdminCommentData(comment: {
  id: string
  content: string
  userId: string | null
  guestName: string | null
  guestEmail: string | null
  parentCommentId: string | null
  isDeleted: boolean
  deletedAt: Date | null
  createdAt: Date
  user: { id: string; name: string | null } | null
  post: { id: string; title: string; slug: string }
}): AdminCommentData {
  return {
    id: comment.id,
    content: comment.content,
    author: toCommentAuthor(comment),
    postId: comment.post.id,
    postTitle: comment.post.title,
    postSlug: comment.post.slug,
    parentCommentId: comment.parentCommentId,
    isDeleted: comment.isDeleted,
    deletedAt: comment.deletedAt,
    createdAt: comment.createdAt,
  }
}

// ==============================================
// Read Operations (verifyAdminSession — plain return types)
// ==============================================

/**
 * コメント一覧を取得（管理画面用）
 */
export async function getAdminComments(
  filters: CommentFilters = {},
  pagination: { page?: number; limit?: number } = {}
): Promise<GetCommentsResult> {
  await verifyAdminSession()

  const { postId, status = 'ALL', search } = filters
  const page = pagination.page ?? 1
  const limit = pagination.limit ?? 20
  const skip = (page - 1) * limit

  const where: Record<string, unknown> = {}

  if (postId) {
    where['postId'] = postId
  }

  if (status === 'ACTIVE') {
    where['isDeleted'] = false
  } else if (status === 'DELETED') {
    where['isDeleted'] = true
  }

  if (search) {
    where['OR'] = [
      { content: { contains: search, mode: 'insensitive' } },
      { guestName: { contains: search, mode: 'insensitive' } },
      { guestEmail: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [total, comments] = await Promise.all([
      prisma.postComment.count({ where }),
      prisma.postComment.findMany({
        where,
        select: {
          id: true,
          content: true,
          userId: true,
          guestName: true,
          guestEmail: true,
          parentCommentId: true,
          isDeleted: true,
          deletedAt: true,
          createdAt: true,
          user: {
            select: {
              id: true,
              name: true,
            },
          },
          post: {
            select: {
              id: true,
              title: true,
              slug: true,
            },
          },
        },
        orderBy: {
          createdAt: 'desc',
        },
        skip,
        take: limit,
      }),
    ])

    return {
      comments: comments.map(toAdminCommentData),
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getAdminComments', page, limit },
    })
    return {
      comments: [],
      total: 0,
      page,
      limit,
      totalPages: 0,
    }
  }
}

/**
 * コメント統計を取得
 */
export async function getCommentStats(): Promise<CommentStats> {
  await verifyAdminSession()

  const today = new Date()
  today.setHours(0, 0, 0, 0)

  try {
    const [total, todayCount, deleted] = await Promise.all([
      prisma.postComment.count(),
      prisma.postComment.count({
        where: {
          createdAt: { gte: today },
        },
      }),
      prisma.postComment.count({
        where: {
          isDeleted: true,
        },
      }),
    ])

    return {
      total,
      today: todayCount,
      deleted,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getCommentStats' },
    })
    return {
      total: 0,
      today: 0,
      deleted: 0,
    }
  }
}

/**
 * 記事ごとのコメント数を取得
 */
export async function getCommentCountByPost(postId: string): Promise<number> {
  await verifyAdminSession()
  try {
    return await prisma.postComment.count({
      where: {
        postId,
        isDeleted: false,
      },
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getCommentCountByPost', postId },
    })
    return 0
  }
}

// ==============================================
// Write Operations (withPermission)
// ==============================================

/**
 * コメントを削除（管理者用）
 */
export const deleteCommentAdmin = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, commentId) => {
  try {
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        post: { select: { slug: true } },
      },
    })

    if (!comment) {
      return createFailure('コメントが見つかりません')
    }

    await prisma.postComment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    updateTag(CACHE_TAGS.POST_COMMENTS)
    updateTag(getCacheTag.posts.comments(comment.post.slug))

    return createSuccess('コメントを削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteCommentAdmin', commentId },
    })
    return createFailure('コメントの削除中にエラーが発生しました')
  }
})

/**
 * コメントを一括削除（管理者用）
 */
export const deleteCommentsAdmin = withPermission<[string[]], { count: number }>(
  'post',
  'delete'
)(async (user, commentIds) => {
  if (commentIds.length === 0) {
    return createFailure('削除するコメントを選択してください')
  }

  try {
    const comments = await prisma.postComment.findMany({
      where: { id: { in: commentIds } },
      select: {
        post: { select: { slug: true } },
      },
    })

    const slugs = [...new Set(comments.map((c) => c.post.slug))]

    const result = await prisma.postComment.updateMany({
      where: { id: { in: commentIds } },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    updateTag(CACHE_TAGS.POST_COMMENTS)
    for (const slug of slugs) {
      updateTag(getCacheTag.posts.comments(slug))
    }

    return createSuccess(`${result.count}件のコメントを削除しました`, { count: result.count })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteCommentsAdmin', commentCount: commentIds.length },
    })
    return createFailure('コメントの削除中にエラーが発生しました')
  }
})

/**
 * 削除したコメントを復元（管理者用）
 */
export const restoreCommentAdmin = withPermission<[string], void>(
  'post',
  'update'
)(async (_user, commentId) => {
  try {
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        isDeleted: true,
        post: { select: { slug: true } },
      },
    })

    if (!comment) {
      return createFailure('コメントが見つかりません')
    }

    if (!comment.isDeleted) {
      return createFailure('このコメントは削除されていません')
    }

    await prisma.postComment.update({
      where: { id: commentId },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    })

    updateTag(CACHE_TAGS.POST_COMMENTS)
    updateTag(getCacheTag.posts.comments(comment.post.slug))

    return createSuccess('コメントを復元しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'restoreCommentAdmin', commentId },
    })
    return createFailure('コメントの復元中にエラーが発生しました')
  }
})
