'use server'

/**
 * 投稿コメント管理 Server Actions（管理側）
 *
 * 管理画面での投稿コメント操作を提供するServer Actions。
 */

import { updateTag } from 'next/cache'
import { z } from 'zod'
import { executeAdminMutation } from '@/admin/lib/admin-action'
import {
  createSuccess,
  type ActionResult,
} from '@/admin/types/server-actions'
import {
  deleteComment as deleteCommentCommand,
  deleteComments as deleteCommentsCommand,
  restoreComment as restoreCommentCommand,
} from '@/shared/domain/post-comments/commands'
import {
  getAdminComments as getAdminCommentsQuery,
  getCommentCountByPost as getCommentCountByPostQuery,
  getCommentStats as getCommentStatsQuery,
} from '@/shared/domain/post-comments/queries'
import type {
  CommentFilters,
  CommentStats,
  GetCommentsResult,
} from '@/shared/domain/post-comments/types'
import { createValidationError } from '@/shared/lib/action-helpers'
import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
import { verifyAdminSession } from '@/shared/lib/auth'

const commentIdSchema = z.string().uuid({ error: 'コメントIDが不正です' })
const commentIdsSchema = z
  .array(commentIdSchema)
  .min(1, { error: '削除するコメントを選択してください' })

export async function getAdminComments(
  filters: CommentFilters = {},
  pagination: { page?: number; limit?: number } = {},
): Promise<GetCommentsResult> {
  await verifyAdminSession()
  return getAdminCommentsQuery(filters, pagination)
}

export async function getCommentStats(): Promise<CommentStats> {
  await verifyAdminSession()
  return getCommentStatsQuery()
}

export async function getCommentCountByPost(postId: string): Promise<number> {
  const validated = commentIdSchema.safeParse(postId)
  if (!validated.success) {
    return 0
  }

  await verifyAdminSession()
  return getCommentCountByPostQuery(validated.data)
}

export async function deleteCommentAdmin(
  commentId: string,
): Promise<ActionResult<void>> {
  const validated = commentIdSchema.safeParse(commentId)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'post',
    action: 'delete',
    resourceId: validated.data,
    execute: async (user) => deleteCommentCommand(validated.data, user.id),
    success: (result) => createSuccess('コメントを削除しました', result),
    afterSuccess: (result) => {
      updateTag(CACHE_TAGS.POST_COMMENTS)
      updateTag(getCacheTag.posts.comments(result.postSlug))
    },
  })
}

export async function deleteCommentsAdmin(
  commentIds: string[],
): Promise<ActionResult<{ count: number }>> {
  const validated = commentIdsSchema.safeParse(commentIds)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'post',
    action: 'delete',
    execute: async (user) => deleteCommentsCommand(validated.data, user.id),
    success: (result) =>
      createSuccess(`${result.count}件のコメントを削除しました`, result),
    afterSuccess: (result) => {
      updateTag(CACHE_TAGS.POST_COMMENTS)
      for (const slug of result.postSlugs) {
        updateTag(getCacheTag.posts.comments(slug))
      }
    },
  })
}

export async function restoreCommentAdmin(
  commentId: string,
): Promise<ActionResult<void>> {
  const validated = commentIdSchema.safeParse(commentId)
  if (!validated.success) {
    return createValidationError(validated.error)
  }

  return executeAdminMutation({
    resource: 'post',
    action: 'update',
    resourceId: validated.data,
    execute: async () => restoreCommentCommand(validated.data),
    success: (result) => createSuccess('コメントを復元しました', result),
    afterSuccess: (result) => {
      updateTag(CACHE_TAGS.POST_COMMENTS)
      updateTag(getCacheTag.posts.comments(result.postSlug))
    },
  })
}

export type {
  AdminCommentData,
  CommentFilters,
  CommentStats,
  GetCommentsResult,
} from '@/shared/domain/post-comments/types'
