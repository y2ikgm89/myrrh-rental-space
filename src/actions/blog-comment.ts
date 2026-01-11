'use server'

import { createHash } from 'crypto'
import { headers } from 'next/headers'
import { revalidatePath } from 'next/cache'
import { prisma } from '@/lib/prisma'
import { auth } from '@/lib/auth'
import { isTurnstileEnabled } from '@/lib/turnstile'
import { validateTurnstile, extractFieldErrors } from '@/lib/action-helpers'
import {
  createCommentSchema,
  toCommentAuthor,
  type CommentActionResult,
  type CommentData,
  type DeleteCommentResult,
} from '@/lib/validations/comment'

// ==============================================
// Helper Functions
// ==============================================

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

  if (forwardedFor) {
    return forwardedFor.split(',')[0].trim()
  }
  if (realIp) {
    return realIp
  }
  return 'unknown'
}

/**
 * レート制限チェック
 * 同一IP/メールアドレスから5分間に3件まで
 */
async function checkRateLimit(
  ipAddress: string,
  email?: string
): Promise<boolean> {
  const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000)

  const whereConditions: Array<{ ipAddress?: string; guestEmail?: string }> = [
    { ipAddress },
  ]
  if (email) {
    whereConditions.push({ guestEmail: email })
  }

  const recentComments = await prisma.blogComment.count({
    where: {
      createdAt: { gte: fiveMinutesAgo },
      OR: whereConditions,
    },
  })

  return recentComments < 3
}

/**
 * 重複コンテンツチェック
 * 同一内容を1分以内に再投稿できない
 */
async function checkDuplicate(
  contentHash: string,
  ipAddress: string
): Promise<boolean> {
  const oneMinuteAgo = new Date(Date.now() - 60 * 1000)

  const existing = await prisma.blogComment.findFirst({
    where: {
      contentHash,
      ipAddress,
      createdAt: { gte: oneMinuteAgo },
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

// ==============================================
// Public Server Actions
// ==============================================

/**
 * コメントを作成
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
  const session = await auth()
  const isLoggedIn = !!session?.user?.id

  // ゲストの場合はTurnstile検証必須
  if (!isLoggedIn && isTurnstileEnabled()) {
    const turnstileResult = await validateTurnstile(input.turnstileToken)
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
    const post = await prisma.blogPost.findUnique({
      where: { id: data.postId, isPublished: true },
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
      const parentComment = await prisma.blogComment.findUnique({
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
    await prisma.blogComment.create({
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
    revalidatePath(`/blog/${post.slug}`)

    return {
      success: true,
      message: 'コメントを投稿しました',
    }
  } catch (error) {
    console.error('コメント作成エラー:', error)
    return {
      success: false,
      error:
        'コメントの投稿中にエラーが発生しました。しばらく経ってから再度お試しください。',
    }
  }
}

/**
 * 記事のコメントを取得（ネスト構造）
 */
export async function getCommentsByPostId(
  postId: string
): Promise<CommentData[]> {
  try {
    // 全コメントを取得（削除済み除外）
    const comments = await prisma.blogComment.findMany({
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
          console.error(
            `[コメント整合性エラー] 親コメントが見つかりません: commentId=${comment.id}, parentCommentId=${comment.parentCommentId}`
          )
          // データ整合性の問題があってもUIを壊さないようルートに追加
          rootComments.push(commentData)
        }
      } else {
        rootComments.push(commentData)
      }
    }

    return rootComments
  } catch (error) {
    console.error('コメント取得エラー:', error)
    return []
  }
}

/**
 * コメントを削除（投稿者本人のみ）
 */
export async function deleteComment(
  commentId: string
): Promise<DeleteCommentResult> {
  const session = await auth()

  if (!session?.user?.id) {
    return {
      success: false,
      error: 'ログインが必要です',
    }
  }

  try {
    // コメントを取得
    const comment = await prisma.blogComment.findUnique({
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
    const result = await prisma.blogComment.updateMany({
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
    revalidatePath(`/blog/${comment.post.slug}`)

    return {
      success: true,
    }
  } catch (error) {
    console.error('コメント削除エラー:', error)
    return {
      success: false,
      error: 'コメントの削除中にエラーが発生しました',
    }
  }
}
