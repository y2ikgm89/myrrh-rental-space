import { z } from 'zod'

/**
 * ゲストコメント用バリデーションスキーマ
 *
 * 未ログインユーザーがコメントする際に使用
 */
export const guestCommentSchema = z.object({
  content: z
    .string()
    .min(1, { error: 'コメントを入力してください' })
    .max(2000, { error: 'コメントは2000文字以内で入力してください' }),
  guestName: z
    .string()
    .min(1, { error: 'お名前を入力してください' })
    .max(100, { error: 'お名前は100文字以内で入力してください' }),
  guestEmail: z
    .string()
    .min(1, { error: 'メールアドレスを入力してください' })
    .email({ error: '有効なメールアドレスを入力してください' }),
})

/**
 * ログインユーザーコメント用バリデーションスキーマ
 *
 * ログイン済みユーザーがコメントする際に使用
 */
export const userCommentSchema = z.object({
  content: z
    .string()
    .min(1, { error: 'コメントを入力してください' })
    .max(2000, { error: 'コメントは2000文字以内で入力してください' }),
})

/**
 * コメント作成用の完全なスキーマ
 *
 * Server Actionで使用
 */
export const createCommentSchema = z.object({
  postId: z.string().uuid({ error: '無効な記事IDです' }),
  parentCommentId: z.string().uuid({ error: '無効なコメントIDです' }).optional(),
  content: z
    .string()
    .min(1, { error: 'コメントを入力してください' })
    .max(2000, { error: 'コメントは2000文字以内で入力してください' }),
  guestName: z.string().max(100).optional(),
  guestEmail: z.string().email().optional(),
})

export type GuestCommentInput = z.input<typeof guestCommentSchema>
export type UserCommentInput = z.input<typeof userCommentSchema>
export type CreateCommentInput = z.input<typeof createCommentSchema>

/**
 * コメント投稿者情報の型
 */
export type CommentAuthor =
  | { type: 'user'; userId: string; name: string }
  | { type: 'guest'; guestName: string; guestEmail: string }

/**
 * DBコメントデータからCommentAuthor型に変換
 */
export function toCommentAuthor(comment: {
  userId: string | null
  guestName: string | null
  guestEmail: string | null
  user: { id: string; name: string | null } | null
}): CommentAuthor {
  if (comment.userId && comment.user) {
    return {
      type: 'user',
      userId: comment.user.id,
      name: comment.user.name ?? '名無し',
    }
  }
  return {
    type: 'guest',
    guestName: comment.guestName ?? 'ゲスト',
    guestEmail: comment.guestEmail ?? '',
  }
}

/**
 * コメントデータの型（ネスト対応）
 */
export type CommentData = {
  id: string
  content: string
  author: CommentAuthor
  parentCommentId: string | null
  createdAt: Date
  replies: CommentData[]
  replyCount: number
}

/**
 * Server Action のレスポンス型
 */
export type CommentActionResult =
  | { success: true; message: string }
  | { success: false; error: string; fieldErrors?: Record<string, string[]> }

/**
 * コメント削除用レスポンス型
 */
export type DeleteCommentResult =
  | { success: true }
  | { success: false; error: string }
