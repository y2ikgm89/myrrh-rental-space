/**
 * Editor Comment Types
 *
 * Lexical MarkNode と連携するエディタコメント機能の型定義
 */

import type {
  EditorCommentThread as PrismaThread,
  EditorComment as PrismaComment,
  EditorCommentStatus,
} from '@/shared/generated/prisma/client'

// =============================================================================
// Re-export Prisma types
// =============================================================================

export type { EditorCommentStatus } from '@/shared/generated/prisma/client'

// =============================================================================
// Content Types
// =============================================================================

/**
 * コメント可能なコンテンツタイプ
 */
export type CommentableContentType = 'post' | 'news' | 'page' | 'faq'

const COMMENTABLE_CONTENT_TYPES = new Set<CommentableContentType>([
  'post',
  'news',
  'page',
  'faq',
])

export function isCommentableContentType(
  value: string
): value is CommentableContentType {
  return COMMENTABLE_CONTENT_TYPES.has(value as CommentableContentType)
}

// =============================================================================
// Thread Types
// =============================================================================

/**
 * コメントスレッド（作成者情報を含む）
 */
export type EditorCommentThread = PrismaThread & {
  comments: EditorComment[]
  createdByUser?: {
    id: string
    name: string
    image: string | null
  }
  resolvedByUser?: {
    id: string
    name: string
    image: string | null
  } | null
}

/**
 * スレッド作成用入力
 */
export type CreateThreadInput = {
  markId: string
  contentType: CommentableContentType
  contentId: string
  quotedText: string
  initialComment: string
}

// =============================================================================
// Comment Types
// =============================================================================

/**
 * コメント（作成者情報を含む）
 */
export type EditorComment = PrismaComment & {
  createdByUser?: {
    id: string
    name: string
    image: string | null
  }
  deletedByUser?: {
    id: string
    name: string
    image: string | null
  } | null
}

/**
 * コメント追加用入力
 */
export type AddCommentInput = {
  threadId: string
  content: string
}

// =============================================================================
// Query Types
// =============================================================================

/**
 * スレッド取得用クエリ
 */
export type GetThreadsQuery = {
  contentType: CommentableContentType
  contentId: string
  status?: EditorCommentStatus
}

// =============================================================================
// UI Types
// =============================================================================

/**
 * コメントパネル用のスレッドリスト
 */
export type ThreadListItem = {
  id: string
  markId: string
  quotedText: string
  status: EditorCommentStatus
  commentCount: number
  latestComment?: {
    content: string
    createdAt: Date
    createdByName: string
  }
  createdAt: Date
  createdByName: string
}

/**
 * エディタ側で使用するマーク情報
 */
export type MarkInfo = {
  markId: string
  threadId: string
  status: EditorCommentStatus
  commentCount: number
}
