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
import { verifyAdminSession } from '@/shared/lib/auth'
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
import { z } from 'zod/v4'

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
// Result Types
// ==============================================

export type ActionResult<T = void> =
  | { success: true; data: T }
  | { success: false; error: string }

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
// Server Actions
// ==============================================

/**
 * コメントスレッドを作成
 */
export async function createCommentThread(
  input: CreateThreadInput
): Promise<ActionResult<EditorCommentThread>> {
  const user = await verifyAdminSession()

  // バリデーション
  const validation = createThreadSchema.safeParse(input)
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? 'バリデーションエラー',
    }
  }

  const { markId, contentType, contentId, quotedText, initialComment } = validation.data

  try {
    // 同一 markId のスレッドが既に存在しないか確認
    const existingThread = await prisma.editorCommentThread.findUnique({
      where: {
        markId_contentType_contentId: {
          markId,
          contentType,
          contentId,
        },
      },
    })

    if (existingThread) {
      return {
        success: false,
        error: 'このマークには既にコメントスレッドが存在します',
      }
    }

    // スレッドと初回コメントを作成
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

    return {
      success: true,
      data: toEditorCommentThread(thread),
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'createCommentThread', contentType, contentId },
    })
    return {
      success: false,
      error: 'コメントスレッドの作成中にエラーが発生しました',
    }
  }
}

/**
 * コメントを追加（返信）
 */
export async function addComment(
  input: AddCommentInput
): Promise<ActionResult<EditorComment>> {
  const user = await verifyAdminSession()

  // バリデーション
  const validation = addCommentSchema.safeParse(input)
  if (!validation.success) {
    return {
      success: false,
      error: validation.error.issues[0]?.message ?? 'バリデーションエラー',
    }
  }

  const { threadId, content } = validation.data

  try {
    // スレッドの存在確認
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return {
        success: false,
        error: 'コメントスレッドが見つかりません',
      }
    }

    if (thread.status === 'DELETED') {
      return {
        success: false,
        error: '削除されたスレッドにはコメントできません',
      }
    }

    // コメントを作成
    const comment = await prisma.editorComment.create({
      data: {
        threadId,
        content,
        createdBy: user.id,
      },
    })

    return {
      success: true,
      data: comment,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'addComment', threadId },
    })
    return {
      success: false,
      error: 'コメントの追加中にエラーが発生しました',
    }
  }
}

/**
 * スレッドを解決済みにする
 */
export async function resolveThread(
  threadId: string
): Promise<ActionResult<void>> {
  const user = await verifyAdminSession()

  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return {
        success: false,
        error: 'コメントスレッドが見つかりません',
      }
    }

    if (thread.status === 'RESOLVED') {
      return {
        success: false,
        error: 'このスレッドは既に解決済みです',
      }
    }

    if (thread.status === 'DELETED') {
      return {
        success: false,
        error: '削除されたスレッドは操作できません',
      }
    }

    await prisma.editorCommentThread.update({
      where: { id: threadId },
      data: {
        status: 'RESOLVED',
        resolvedAt: new Date(),
        resolvedBy: user.id,
      },
    })

    return { success: true, data: undefined }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'resolveThread', threadId },
    })
    return {
      success: false,
      error: 'スレッドの解決中にエラーが発生しました',
    }
  }
}

/**
 * スレッドを再オープンする
 */
export async function reopenThread(
  threadId: string
): Promise<ActionResult<void>> {
  await verifyAdminSession()

  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return {
        success: false,
        error: 'コメントスレッドが見つかりません',
      }
    }

    if (thread.status === 'ACTIVE') {
      return {
        success: false,
        error: 'このスレッドは既にアクティブです',
      }
    }

    if (thread.status === 'DELETED') {
      return {
        success: false,
        error: '削除されたスレッドは操作できません',
      }
    }

    await prisma.editorCommentThread.update({
      where: { id: threadId },
      data: {
        status: 'ACTIVE',
        resolvedAt: null,
        resolvedBy: null,
      },
    })

    return { success: true, data: undefined }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'reopenThread', threadId },
    })
    return {
      success: false,
      error: 'スレッドの再オープン中にエラーが発生しました',
    }
  }
}

/**
 * スレッドを削除（ソフトデリート）
 */
export async function deleteThread(
  threadId: string
): Promise<ActionResult<void>> {
  await verifyAdminSession()

  try {
    const thread = await prisma.editorCommentThread.findUnique({
      where: { id: threadId },
      select: { id: true, status: true },
    })

    if (!thread) {
      return {
        success: false,
        error: 'コメントスレッドが見つかりません',
      }
    }

    if (thread.status === 'DELETED') {
      return {
        success: false,
        error: 'このスレッドは既に削除されています',
      }
    }

    await prisma.editorCommentThread.update({
      where: { id: threadId },
      data: {
        status: 'DELETED',
      },
    })

    return { success: true, data: undefined }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteThread', threadId },
    })
    return {
      success: false,
      error: 'スレッドの削除中にエラーが発生しました',
    }
  }
}

/**
 * コメントを削除（ソフトデリート）
 */
export async function deleteComment(
  commentId: string
): Promise<ActionResult<void>> {
  const user = await verifyAdminSession()

  try {
    const comment = await prisma.editorComment.findUnique({
      where: { id: commentId },
      select: { id: true, isDeleted: true },
    })

    if (!comment) {
      return {
        success: false,
        error: 'コメントが見つかりません',
      }
    }

    if (comment.isDeleted) {
      return {
        success: false,
        error: 'このコメントは既に削除されています',
      }
    }

    await prisma.editorComment.update({
      where: { id: commentId },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: user.id,
      },
    })

    return { success: true, data: undefined }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'deleteComment', commentId },
    })
    return {
      success: false,
      error: 'コメントの削除中にエラーが発生しました',
    }
  }
}

/**
 * コンテンツに紐づくスレッド一覧を取得
 */
export async function getCommentThreads(
  query: GetThreadsQuery
): Promise<ActionResult<ThreadListItem[]>> {
  await verifyAdminSession()

  const { contentType, contentId, status } = query

  if (!isCommentableContentType(contentType)) {
    return {
      success: false,
      error: '無効なコンテンツタイプです',
    }
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

    // ユーザー情報を取得
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

    return {
      success: true,
      data: items.map(toThreadListItem),
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getCommentThreads', contentType, contentId },
    })
    return {
      success: false,
      error: 'スレッド一覧の取得中にエラーが発生しました',
    }
  }
}

/**
 * スレッドの詳細を取得（全コメント含む）
 */
export async function getThreadDetail(
  threadId: string
): Promise<ActionResult<EditorCommentThread>> {
  await verifyAdminSession()

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
      return {
        success: false,
        error: 'コメントスレッドが見つかりません',
      }
    }

    // スレッドとコメントの作成者情報を取得
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

    return {
      success: true,
      data: {
        ...thread,
        comments: commentsWithUsers,
        createdByUser: thread.createdBy ? userMap.get(thread.createdBy) : undefined,
        resolvedByUser: thread.resolvedBy ? userMap.get(thread.resolvedBy) : null,
      },
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: { operation: 'getThreadDetail', threadId },
    })
    return {
      success: false,
      error: 'スレッド詳細の取得中にエラーが発生しました',
    }
  }
}

/**
 * エディタで使用するマーク情報一覧を取得
 */
export async function getMarkInfoList(
  contentType: CommentableContentType,
  contentId: string
): Promise<ActionResult<MarkInfo[]>> {
  await verifyAdminSession()

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

    return {
      success: true,
      data: markInfoList,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: { operation: 'getMarkInfoList', contentType, contentId },
    })
    return {
      success: false,
      error: 'マーク情報の取得中にエラーが発生しました',
    }
  }
}
