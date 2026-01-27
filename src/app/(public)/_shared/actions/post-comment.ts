'use server'

/**
 * 投稿コメント関連 Server Actions
 *
 * 投稿記事へのコメント投稿、取得、削除を行うServer Actions。
 * ログインユーザーとゲストユーザーの両方に対応しています。
 *
 * ## 主な機能
 * - コメント作成（ログインユーザー / ゲスト）
 * - コメント取得（ネスト構造対応）
 * - コメント削除（投稿者本人のみ）
 *
 * ## セキュリティ対策
 * - ゲストはTurnstile検証必須
 * - IPアドレスのハッシュ化（プライバシー保護）
 * - レート制限（5分間に3件まで）
 * - 重複コンテンツ検出
 * - TOCTOU対策（削除時のWHERE句による所有者チェック）
 *
 * @module public/actions/post-comment
 */

import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { updateTag } from 'next/cache'
import { getCacheTag } from '@/shared/lib/constants'
import { prisma } from '@/shared/lib/prisma'
import { getSession } from '@/shared/lib/auth'
import { isTurnstileEnabled } from '@/shared/lib/turnstile'
import { extractFirstFromCommaList } from '@/shared/lib/serialize'
import { validateTurnstile, extractFieldErrors } from '@/shared/lib/action-helpers'
import { PostStatus } from '@/shared/generated/prisma/enums'
import {
  createCommentSchema,
  toCommentAuthor,
  type CommentActionResult,
  type CommentData,
  type DeleteCommentResult,
} from '@/shared/lib/validations/comment'
import { logError, ErrorCategory, ErrorSeverity, normalizeError } from '@/shared/lib/errors'

// =============================================================================
// Constants
// =============================================================================

/** レート制限: 制限時間（ミリ秒） */
const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000

/** レート制限: 最大投稿数 */
const RATE_LIMIT_MAX_COMMENTS = 3

/** 重複チェック: 制限時間（ミリ秒） */
const DUPLICATE_CHECK_WINDOW_MS = 60 * 1000

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * IPアドレスをハッシュ化（プライバシー保護）
 */
function hashIpAddress(ip: string): string {
  return createHash('sha256').update(ip).digest('hex').substring(0, 32)
}

/**
 * コンテンツのハッシュを生成（重複検出用）
 */
function generateContentHash(content: string): string {
  return createHash('sha256')
    .update(content.trim().toLowerCase())
    .digest('hex')
    .substring(0, 32)
}

/**
 * クライアントIPアドレスを取得
 */
async function getClientIp(): Promise<string> {
  const headersList = await headers()
  const forwardedFor = headersList.get('x-forwarded-for')
  const realIp = headersList.get('x-real-ip')

  return extractFirstFromCommaList(forwardedFor) ?? realIp ?? 'unknown'
}

/**
 * レート制限チェック
 *
 * 同一IP/メールアドレスからの連続投稿を制限します。
 *
 * @param ipAddress - ハッシュ化されたIPアドレス
 * @param email - メールアドレス（オプション）
 * @returns 制限内であれば true、超過していれば false
 */
async function checkRateLimit(
  ipAddress: string,
  email?: string
): Promise<boolean> {
  const windowStart = new Date(Date.now() - RATE_LIMIT_WINDOW_MS)

  const whereConditions: Array<{ ipAddress?: string; guestEmail?: string }> = [
    { ipAddress },
  ]
  if (email) {
    whereConditions.push({ guestEmail: email })
  }

  const recentComments = await prisma.postComment.count({
    where: {
      createdAt: { gte: windowStart },
      OR: whereConditions,
    },
  })

  return recentComments < RATE_LIMIT_MAX_COMMENTS
}

/**
 * 重複コンテンツチェック
 *
 * 同一内容のコメントが短時間内に投稿されていないかチェックします。
 *
 * @param contentHash - コンテンツのハッシュ値
 * @param ipAddress - ハッシュ化されたIPアドレス
 * @returns 重複している場合は true
 */
async function checkDuplicate(
  contentHash: string,
  ipAddress: string
): Promise<boolean> {
  const windowStart = new Date(Date.now() - DUPLICATE_CHECK_WINDOW_MS)

  const existing = await prisma.postComment.findFirst({
    where: {
      contentHash,
      ipAddress,
      createdAt: { gte: windowStart },
    },
  })

  return existing !== null
}

/**
 * DBコメントをCommentData型に変換
 */
function toCommentData(
  comment: {
    id: string
    content: string
    userId: string | null
    guestName: string | null
    guestEmail: string | null
    parentCommentId: string | null
    createdAt: Date
    user: { id: string; name: string | null } | null
  },
  replies: CommentData[] = []
): CommentData {
  return {
    id: comment.id,
    content: comment.content,
    author: toCommentAuthor(comment),
    parentCommentId: comment.parentCommentId,
    createdAt: comment.createdAt,
    replies,
    replyCount: replies.length,
  }
}

// =============================================================================
// Server Actions
// =============================================================================

/**
 * コメントを作成する
 *
 * ログインユーザーまたはゲストユーザーとしてコメントを投稿します。
 * ゲストの場合はTurnstile検証と名前・メールアドレスが必須です。
 *
 * @param input - コメント入力データ
 * @returns コメント作成結果
 */
export async function createComment(input: {
  postId: string
  parentCommentId?: string
  content: string
  guestName?: string
  guestEmail?: string
  turnstileToken?: string
}): Promise<CommentActionResult> {
  // 認証情報を取得
  const session = await getSession()
  const isLoggedIn = !!session?.user?.id

  // ゲストの場合はTurnstile検証必須
  if (!isLoggedIn && (await isTurnstileEnabled())) {
    // skipEnabledCheck: true で二重DBクエリを回避
    const turnstileResult = await validateTurnstile(input.turnstileToken, {
      skipEnabledCheck: true,
    })
    if (!turnstileResult.success) {
      return { success: false, error: turnstileResult.error }
    }
  }

  // バリデーション
  const validationResult = createCommentSchema.safeParse(input)
  if (!validationResult.success) {
    return {
      success: false,
      error: 'バリデーションエラーが発生しました',
      fieldErrors: extractFieldErrors(validationResult.error),
    }
  }

  const data = validationResult.data

  // ゲストの場合は名前・メールアドレス必須
  if (!isLoggedIn && (!data.guestName || !data.guestEmail)) {
    return {
      success: false,
      error: 'お名前とメールアドレスを入力してください',
      fieldErrors: {
        guestName: data.guestName ? [] : ['お名前を入力してください'],
        guestEmail: data.guestEmail ? [] : ['メールアドレスを入力してください'],
      },
    }
  }

  try {
    // 記事の存在確認
    const post = await prisma.post.findUnique({
      where: { id: data.postId, status: PostStatus.PUBLISHED },
      select: { id: true, slug: true },
    })

    if (!post) {
      return {
        success: false,
        error: '記事が見つかりません',
      }
    }

    // 親コメントの存在確認（返信の場合）
    if (data.parentCommentId) {
      const parentComment = await prisma.postComment.findUnique({
        where: { id: data.parentCommentId, isDeleted: false },
        select: { id: true },
      })

      if (!parentComment) {
        return {
          success: false,
          error: '返信先のコメントが見つかりません',
        }
      }
    }

    // IPアドレス取得とハッシュ化
    const clientIp = await getClientIp()
    const hashedIp = hashIpAddress(clientIp)

    // レート制限チェック
    const withinRateLimit = await checkRateLimit(hashedIp, data.guestEmail)
    if (!withinRateLimit) {
      return {
        success: false,
        error:
          '投稿回数の制限に達しました。しばらく経ってから再度お試しください。',
      }
    }

    // 重複チェック
    const contentHash = generateContentHash(data.content)
    const isDuplicate = await checkDuplicate(contentHash, hashedIp)
    if (isDuplicate) {
      return {
        success: false,
        error: '同じ内容のコメントが最近投稿されています。',
      }
    }

    // コメント作成
    await prisma.postComment.create({
      data: {
        postId: data.postId,
        parentCommentId: data.parentCommentId ?? null,
        content: data.content,
        userId: isLoggedIn ? session.user.id : null,
        guestName: isLoggedIn ? null : data.guestName,
        guestEmail: isLoggedIn ? null : data.guestEmail,
        ipAddress: hashedIp,
        contentHash,
      },
    })

    // キャッシュ無効化
    updateTag(getCacheTag.posts.comments(post.slug))

    return {
      success: true,
      message: 'コメントを投稿しました',
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'createComment',
        postId: input.postId,
      },
    })
    return {
      success: false,
      error:
        'コメントの投稿中にエラーが発生しました。しばらく経ってから再度お試しください。',
    }
  }
}

/**
 * 記事のコメントを取得する（ネスト構造）
 *
 * 指定された記事のコメントを取得し、親子関係に基づいて
 * ネスト構造に変換して返します。
 *
 * @param postId - 投稿記事ID
 * @returns コメントの配列（ネスト構造）
 */
export async function getCommentsByPostId(
  postId: string
): Promise<CommentData[]> {
  try {
    // 全コメントを取得（削除済み除外）
    const comments = await prisma.postComment.findMany({
      where: {
        postId,
        isDeleted: false,
      },
      select: {
        id: true,
        content: true,
        userId: true,
        guestName: true,
        guestEmail: true,
        parentCommentId: true,
        createdAt: true,
        user: {
          select: {
            id: true,
            name: true,
          },
        },
      },
      orderBy: {
        createdAt: 'asc',
      },
    })

    // ネスト構造を構築
    const commentMap = new Map<string, CommentData>()
    const rootComments: CommentData[] = []

    // まず全コメントをマップに登録
    for (const comment of comments) {
      commentMap.set(comment.id, toCommentData(comment, []))
    }

    // 親子関係を構築
    for (const comment of comments) {
      const commentData = commentMap.get(comment.id)!
      if (comment.parentCommentId) {
        const parent = commentMap.get(comment.parentCommentId)
        if (parent) {
          parent.replies.push(commentData)
          parent.replyCount = parent.replies.length
        } else {
          // 親が見つからない場合（データ整合性の問題）
          // Cascade deleteにより本来は発生しないはずだが、エラーログを出力
          logError(new Error('親コメントが見つかりません'), {
            category: ErrorCategory.DATABASE,
            severity: ErrorSeverity.LOW,
            context: {
              operation: 'getCommentsByPostId',
              commentId: comment.id,
              parentCommentId: comment.parentCommentId,
            },
          })
          // データ整合性の問題があってもUIを壊さないようルートに追加
          rootComments.push(commentData)
        }
      } else {
        rootComments.push(commentData)
      }
    }

    return rootComments
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.LOW,
      context: {
        operation: 'getCommentsByPostId',
        postId,
      },
    })
    return []
  }
}

/**
 * コメントを削除する（投稿者本人のみ）
 *
 * ログインユーザーが自身のコメントを削除します。
 * ソフトデリート方式で、実際のデータは保持されます。
 *
 * @param commentId - コメントID
 * @returns 削除結果
 */
export async function deleteComment(
  commentId: string
): Promise<DeleteCommentResult> {
  const session = await getSession()

  if (!session?.user?.id) {
    return {
      success: false,
      error: 'ログインが必要です',
    }
  }

  try {
    // コメントを取得
    const comment = await prisma.postComment.findUnique({
      where: { id: commentId },
      select: {
        id: true,
        userId: true,
        postId: true,
        post: {
          select: { slug: true },
        },
      },
    })

    if (!comment) {
      return {
        success: false,
        error: 'コメントが見つかりません',
      }
    }

    // ソフトデリート（TOCTOU対策：WHERE句で所有者チェックを行う）
    const result = await prisma.postComment.updateMany({
      where: {
        id: commentId,
        userId: session.user.id, // 所有者チェックをWHERE句に含める
        isDeleted: false, // 既に削除されていないことを確認
      },
      data: {
        isDeleted: true,
        deletedAt: new Date(),
        deletedBy: session.user.id,
      },
    })

    // 更新件数が0の場合は権限エラー
    if (result.count === 0) {
      return {
        success: false,
        error: 'このコメントを削除する権限がありません',
      }
    }

    // キャッシュ無効化
    updateTag(getCacheTag.posts.comments(comment.post.slug))

    return {
      success: true,
    }
  } catch (error) {
    logError(normalizeError(error), {
      category: ErrorCategory.DATABASE,
      severity: ErrorSeverity.MEDIUM,
      context: {
        operation: 'deleteComment',
        commentId,
      },
    })
    return {
      success: false,
      error: 'コメントの削除中にエラーが発生しました',
    }
  }
}
