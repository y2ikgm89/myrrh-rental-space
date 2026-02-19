'use server'

/**
 * エディタコメント Server Actions
 *
 * Lexical MarkNode と連携するエディタコメント機能を提供する Server Actions。
 * ブログ、ニュース、ページ、FAQ などのコンテンツ内にコメントを付与できます。
 *
 * ## 主な機能
 * - コメントスレッドの作成
 * - コメントの追加（返信）
 * - スレッドの解決
 * - スレッド・コメントの削除
 * - コンテンツに紐づくスレッド一覧取得
 *
 * @module admin/actions/editor-comment
 */

import { prisma } from '@/shared/lib/prisma'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'
import type { EditorCommentStatus } from '@/shared/generated/prisma/client'
import type {
  EditorCommentThread,
  EditorComment,
  CreateThreadInput,
  AddCommentInput,
  GetThreadsQuery,
  ThreadListItem,
  MarkInfo,
  CommentableContentType,
} from '@/admin/types/editor-comment'
import { isCommentableContentType } from '@/admin/types/editor-comment'
import { createValidationError } from '@/shared/lib/action-helpers'
import { z } from 'zod/v4'
import { withPermission } from '@/admin/lib/server-action-helpers'
import { createSuccess, createFailure } from '@/admin/types/server-actions'

// ==============================================
// Validation Schemas
// ==============================================

const createThreadSchema = z.object({
  markId: z.string().min(1, { error: 'markId は必須です' }),
  contentType: z.string().refine(isCommentableContentType, { error: 'contentType が無効です' }),
  contentId: z.string().uuid({ error: 'contentId は有効な UUID である必要があります' }),
  quotedText: z.string().min(1, { error: '引用テキストは必須です' }).max(2000, { error: '引用テキストは2000文字以内' }),
  initialComment: z.string().min(1, { error: 'コメントは必須です' }).max(5000, { error: 'コメントは5000文字以内' }),
})

const addCommentSchema = z.object({
  threadId: z.string().uuid({ error: 'threadId は有効な UUID である必要があります' }),
  content: z.string().min(1, { error: 'コメントは必須です' }).max(5000, { error: 'コメントは5000文字以内' }),
})

// ==============================================
// Helper Functions
// ==============================================

function toEditorCommentThread(thread: {
  id: string
  markId: string
  contentType: string
  contentId: string
  quotedText: string
  status: EditorCommentStatus
  resolvedAt: Date | null
  resolvedBy: string | null
  createdAt: Date
  updatedAt: Date
  createdBy: string | null
  comments: Array<{
    id: string
    threadId: string
    content: string
    isDeleted: boolean
    deletedAt: Date | null
    deletedBy: string | null
    createdAt: Date
    updatedAt: Date
    createdBy: string | null
  }>
}): EditorCommentThread {
  return {
    ...thread,
    comments: thread.comments,
  }
}

function toThreadListItem(thread: {
  id: string
  markId: string
  quotedText: string
  status: EditorCommentStatus
  createdAt: Date
  createdBy: string | null
  comments: Array<{
    content: string
    createdAt: Date
    createdBy: string | null
  }>
  _count: { comments: number }
  createdByUser?: { name: string } | null
}): ThreadListItem {
  const latestComment = thread.comments[0]

  return {
    id: thread.id,
    markId: thread.markId,
    quotedText: thread.quotedText,
    status: thread.status,
    commentCount: thread._count.comments,
    latestComment: latestComment
      ? {
          content: latestComment.content,
          createdAt: latestComment.createdAt,
          createdByName: thread.createdByUser?.name ?? '不明',
        }
      : undefined,
    createdAt: thread.createdAt,
    createdByName: thread.createdByUser?.name ?? '不明',
  }
}

// ==============================================
// Write Operations (withPermission)
// ==============================================

/**
 * コメントスレッドを作成
 */
export const createCommentThread = withPermission<
  [CreateThreadInput],
  EditorCommentThread
>('post', 'update')(async (user, input) => {
  const validation = createThreadSchema.safeParse(input)
  if (!validation.success) {
    return createValidationError(validation.error)
  }

  const { markId, contentType, contentId, quotedText, initialComment } = validation.data

  try {
    const existingThread = await prisma.editorCommentThread.findUnique({
      where: {
        markId_contentType_contentId: {
          markId,
          contentType,
          contentId,
        },
      },
      select: { id: true },
    })

    if (existingThread) {
      return createFailure('このマークには既にコメントスレッドが存在します')
    }

    const thread = await prisma.editorCommentThread.create({
      data: {
        markId,
        contentType,
        contentId,
        quotedText,
        createdBy: user.id,
        comments: {
          create: {
            content: initialComment,
            createdBy: user.id,
          },
        },
      },
      include: {
        comments: {
          orderBy: { createdAt: 'asc' },
          select: {
            id: true,
            threadId: true,
            content: true,
            isDeleted: true,
            deletedAt: true,
            deletedBy: true,
            createdAt: true,
            updatedAt: true,
            createdBy: true,
          },
        },
      },
    })

    return createSuccess('コメントスレッドを作成しました', toEditorCommentThread(thread))
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createCommentThread', contentType, contentId },
    })
    return createFailure('コメントスレッドの作成中にエラーが発生しました')
  }
})

/**
 * コメントを追加（返信）
 */
export const addComment = withPermission<
  [AddCommentInput],
  EditorComment
>('post', 'update')(async (user, input) => {
  const validation = addCommentSchema.safeParse(input)
  if (!validation.success) {
    return createValidationError(validation.error)
  }

  const { threadId, content } = validation.data

  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return createFailure('コメントスレッドが見つかりません')
    }

    if (thread.status === 'DELETED') {
      return createFailure('削除されたスレッドにはコメントできません')
    }

    const comment = await prisma.editorComment.create({
      data: {
        threadId,
        content,
        createdBy: user.id,
      },
    })

    return createSuccess('コメントを追加しました', comment)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'addComment', threadId },
    })
    return createFailure('コメントの追加中にエラーが発生しました')
  }
})

/**
 * スレッドを解決済みにする
 */
export const resolveThread = withPermission<[string], void>(
  'post',
  'update'
)(async (user, threadId) => {
  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return createFailure('コメントスレッドが見つかりません')
    }

    if (thread.status === 'RESOLVED') {
      return createFailure('このスレッドは既に解決済みです')
    }

    if (thread.status === 'DELETED') {
      return createFailure('削除されたスレッドは操作できません')
    }

    await prisma.editorCommentThread.update({
      where: { id: threadId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: user.id,
      },
    })

    return createSuccess('スレッドを解決しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'resolveThread', threadId },
    })
    return createFailure('スレッドの解決中にエラーが発生しました')
  }
})

/**
 * スレッドを再オープンする
 */
export const reopenThread = withPermission<[string], void>(
  'post',
  'update'
)(async (_user, threadId) => {
  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return createFailure('コメントスレッドが見つかりません')
    }

    if (thread.status === 'ACTIVE') {
      return createFailure('このスレッドは既にアクティブです')
    }

    if (thread.status === 'DELETED') {
      return createFailure('削除されたスレッドは操作できません')
    }

    await prisma.editorCommentThread.update({
      where: { id: threadId },
      data: {
        status: 'ACTIVE',
        resolvedAt: null,
        resolvedBy: null,
      },
    })

    return createSuccess('スレッドを再オープンしました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'reopenThread', threadId },
    })
    return createFailure('スレッドの再オープン中にエラーが発生しました')
  }
})

/**
 * スレッドを削除（ソフトデリート）
 */
export const deleteThread = withPermission<[string], void>(
  'post',
  'delete'
)(async (_user, threadId) => {
  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return createFailure('コメントスレッドが見つかりません')
    }

    if (thread.status === 'DELETED') {
      return createFailure('このスレッドは既に削除されています')
    }

    await prisma.editorCommentThread.update({
      where: { id: threadId },
      data: {
        status: 'DELETED',
      },
    })

    return createSuccess('スレッドを削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteThread', threadId },
    })
    return createFailure('スレッドの削除中にエラーが発生しました')
  }
})

/**
 * コメントを削除（ソフトデリート）
 */
export const deleteComment = withPermission<[string], void>(
  'post',
  'delete'
)(async (user, commentId) => {
  try {
    const comment = await prisma.editorComment.findUnique({
      where: { id: commentId },
      select: { id: true, isDeleted: true },
    })

    if (!comment) {
      return createFailure('コメントが見つかりません')
    }

    if (comment.isDeleted) {
      return createFailure('このコメントは既に削除されています')
    }

    await prisma.editorComment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    return createSuccess('コメントを削除しました')
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteComment', commentId },
    })
    return createFailure('コメントの削除中にエラーが発生しました')
  }
})

// ==============================================
// Read Operations (withPermission, audit: false)
// ==============================================

/**
 * コンテンツに紐づくスレッド一覧を取得
 */
export const getCommentThreads = withPermission<
  [GetThreadsQuery],
  ThreadListItem[]
>('post', 'read', { audit: false })(async (_user, query) => {
  const { contentType, contentId, status } = query

  if (!isCommentableContentType(contentType)) {
    return createFailure('無効なコンテンツタイプです')
  }

  try {
    const threads = await prisma.editorCommentThread.findMany({
      where: {
        contentType,
        contentId,
        ...(status ? { status } : { status: { not: 'DELETED' } }),
      },
      select: {
        id: true,
        markId: true,
        quotedText: true,
        status: true,
        createdAt: true,
        createdBy: true,
        comments: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'desc' },
          take: 1,
          select: {
            content: true,
            createdAt: true,
            createdBy: true,
          },
        },
        _count: {
          select: {
            comments: {
              where: { isDeleted: false },
            },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    })

    const userIds = [
      ...new Set(
        threads
          .map((t) => t.createdBy)
          .filter((id): id is string => id !== null)
      ),
    ]

    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, name: true },
    })

    const userMap = new Map(users.map((u) => [u.id, u]))

    const items = threads.map((thread) => ({
      ...thread,
      createdByUser: thread.createdBy ? userMap.get(thread.createdBy) ?? null : null,
    }))

    return createSuccess('スレッド一覧を取得しました', items.map(toThreadListItem))
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getCommentThreads', contentType, contentId },
    })
    return createFailure('スレッド一覧の取得中にエラーが発生しました')
  }
})

/**
 * スレッドの詳細を取得（全コメント含む）
 */
export const getThreadDetail = withPermission<
  [string],
  EditorCommentThread
>('post', 'read', { audit: false })(async (_user, threadId) => {
  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      include: {
        comments: {
          where: { isDeleted: false },
          orderBy: { createdAt: 'asc' },
        },
      },
    })

    if (!thread) {
      return createFailure('コメントスレッドが見つかりません')
    }

    const userIds = [
      thread.createdBy,
      thread.resolvedBy,
      ...thread.comments.map((c) => c.createdBy),
    ].filter((id): id is string => id !== null)
    const uniqueUserIds = [...new Set(userIds)]
    const users = await prisma.user.findMany({
      where: { id: { in: uniqueUserIds } },
      select: { id: true, name: true, image: true },
    })
    const userMap = new Map(users.map((u) => [u.id, u]))

    const commentsWithUsers = thread.comments.map((comment) => ({
      ...comment,
      createdByUser: comment.createdBy ? userMap.get(comment.createdBy) : undefined,
    }))

    return createSuccess('スレッド詳細を取得しました', {
      ...thread,
      comments: commentsWithUsers,
      createdByUser: thread.createdBy ? userMap.get(thread.createdBy) : undefined,
      resolvedByUser: thread.resolvedBy ? userMap.get(thread.resolvedBy) : null,
    })
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getThreadDetail', threadId },
    })
    return createFailure('スレッド詳細の取得中にエラーが発生しました')
  }
})

/**
 * エディタで使用するマーク情報一覧を取得
 */
export const getMarkInfoList = withPermission<
  [CommentableContentType, string],
  MarkInfo[]
>('post', 'read', { audit: false })(async (_user, contentType, contentId) => {
  try {
    const threads = await prisma.editorCommentThread.findMany({
      where: {
        contentType,
        contentId,
        status: { not: 'DELETED' },
      },
      select: {
        id: true,
        markId: true,
        status: true,
        _count: {
          select: {
            comments: {
              where: { isDeleted: false },
            },
          },
        },
      },
    })

    const markInfoList: MarkInfo[] = threads.map((thread) => ({
      markId: thread.markId,
      threadId: thread.id,
      status: thread.status,
      commentCount: thread._count.comments,
    }))

    return createSuccess('マーク情報を取得しました', markInfoList)
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getMarkInfoList', contentType, contentId },
    })
    return createFailure('マーク情報の取得中にエラーが発生しました')
  }
})
