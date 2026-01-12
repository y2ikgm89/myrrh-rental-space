'use server'

import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { verifyAdminSession } from '@/lib/auth'
import { toCommentAuthor, type CommentAuthor } from '@/lib/validations/comment'

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

export type AdminCommentActionResult =
  | { success: true }
  | { success: false; error: string }

export type BulkDeleteResult =
  | { success: true; count: number }
  | { success: false; error: string }

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
// Admin Server Actions
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

  // Where条件を構築
  const where: Record<string, unknown> = {}

  if (postId) {
    where.postId = postId
  }

  if (status === 'ACTIVE') {
    where.isDeleted = false
  } else if (status === 'DELETED') {
    where.isDeleted = true
  }

  if (search) {
    where.OR = [
      { content: { contains: search, mode: 'insensitive' } },
      { guestName: { contains: search, mode: 'insensitive' } },
      { guestEmail: { contains: search, mode: 'insensitive' } },
      { user: { name: { contains: search, mode: 'insensitive' } } },
    ]
  }

  try {
    const [total, comments] = await Promise.all([
      prisma.blogComment.count({ where }),
      prisma.blogComment.findMany({
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
    console.error('管理コメント一覧取得エラー:', error)
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
      prisma.blogComment.count(),
      prisma.blogComment.count({
        where: {
          createdAt: { gte: today },
        },
      }),
      prisma.blogComment.count({
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
    console.error('コメント統計取得エラー:', error)
    return {
      total: 0,
      today: 0,
      deleted: 0,
    }
  }
}

/**
 * コメントを削除（管理者用）
 */
export async function deleteCommentAdmin(
  commentId: string
): Promise<AdminCommentActionResult> {
  const user = await verifyAdminSession()

  try {
    const comment = await prisma.blogComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        post: { select: { slug: true } },
      },
    })

    if (!comment) {
      return {
        success: false,
        error: 'コメントが見つかりません',
      }
    }

    // ソフトデリート
    await prisma.blogComment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    // キャッシュ無効化
    revalidatePath('/admin/blog/comments')
    revalidatePath(`/blog/${comment.post.slug}`)

    return { success: true }
  } catch (error) {
    console.error('コメント削除エラー:', error)
    return {
      success: false,
      error: 'コメントの削除中にエラーが発生しました',
    }
  }
}

/**
 * コメントを一括削除（管理者用）
 */
export async function deleteCommentsAdmin(
  commentIds: string[]
): Promise<BulkDeleteResult> {
  const user = await verifyAdminSession()

  if (commentIds.length === 0) {
    return {
      success: false,
      error: '削除するコメントを選択してください',
    }
  }

  try {
    // 対象コメントの記事スラッグを取得（キャッシュ無効化用）
    const comments = await prisma.blogComment.findMany({
      where: { id: { in: commentIds } },
      select: {
        post: { select: { slug: true } },
      },
    })

    const slugs = [...new Set(comments.map((c) => c.post.slug))]

    // 一括ソフトデリート
    const result = await prisma.blogComment.updateMany({
      where: { id: { in: commentIds } },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    // キャッシュ無効化
    revalidatePath('/admin/blog/comments')
    for (const slug of slugs) {
      revalidatePath(`/blog/${slug}`)
    }

    return {
      success: true,
      count: result.count,
    }
  } catch (error) {
    console.error('コメント一括削除エラー:', error)
    return {
      success: false,
      error: 'コメントの削除中にエラーが発生しました',
    }
  }
}

/**
 * 削除したコメントを復元（管理者用）
 */
export async function restoreCommentAdmin(
  commentId: string
): Promise<AdminCommentActionResult> {
  await verifyAdminSession()

  try {
    const comment = await prisma.blogComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        isDeleted: true,
        post: { select: { slug: true } },
      },
    })

    if (!comment) {
      return {
        success: false,
        error: 'コメントが見つかりません',
      }
    }

    if (!comment.isDeleted) {
      return {
        success: false,
        error: 'このコメントは削除されていません',
      }
    }

    // 復元
    await prisma.blogComment.update({
      where: { id: commentId },
      data: {
        isDeleted: false,
        deletedAt: null,
        deletedBy: null,
      },
    })

    // キャッシュ無効化
    revalidatePath('/admin/blog/comments')
    revalidatePath(`/blog/${comment.post.slug}`)

    return { success: true }
  } catch (error) {
    console.error('コメント復元エラー:', error)
    return {
      success: false,
      error: 'コメントの復元中にエラーが発生しました',
    }
  }
}

/**
 * 記事ごとのコメント数を取得
 */
export async function getCommentCountByPost(postId: string): Promise<number> {
  try {
    return await prisma.blogComment.count({
      where: {
        postId,
        isDeleted: false,
      },
    })
  } catch (error) {
    console.error('コメント数取得エラー:', error)
    return 0
  }
}
