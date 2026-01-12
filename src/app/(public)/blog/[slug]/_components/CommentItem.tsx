'use client'

/**
 * 単一コメント（Client Component）
 *
 * ネスト表示、折りたたみ、返信機能を含む
 * 無制限ネストに対応、表示インデントは4階層で打ち止め
 */

import { useState } from 'react'
import { useSession } from '@/lib/auth-client'
import { formatDistanceToNow } from 'date-fns'
import { ja } from 'date-fns/locale'
import { MessageCircle, ChevronDown, ChevronUp, Trash2, User } from 'lucide-react'
import { cn, escapeHtml } from '@/lib/utils'
import { deleteComment } from '@/actions/blog-comment'
import { CommentForm } from './CommentForm'
import type { CommentData } from '@/lib/validations/comment'

type Props = {
  comment: CommentData
  postId: string
  postSlug: string
  depth: number
  maxIndentDepth?: number
}

const MAX_INDENT_DEPTH = 4

export function CommentItem({
  comment,
  postId,
  postSlug,
  depth,
  maxIndentDepth = MAX_INDENT_DEPTH,
}: Props) {
  const { data: session } = useSession()
  const [showReplyForm, setShowReplyForm] = useState(false)
  const [collapsed, setCollapsed] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)
  const [deleteError, setDeleteError] = useState<string | null>(null)

  // インデント計算（最大深度で打ち止め）
  const indentLevel = Math.min(depth, maxIndentDepth)

  // 投稿者名
  const authorName =
    comment.author.type === 'user'
      ? comment.author.name
      : comment.author.guestName

  // 自分のコメントかどうか
  const isOwnComment =
    session?.user?.id &&
    comment.author.type === 'user' &&
    comment.author.userId === session.user.id

  // コメント削除
  async function handleDelete() {
    if (!confirm('このコメントを削除しますか？')) return

    setIsDeleting(true)
    setDeleteError(null)

    const result = await deleteComment(comment.id)
    if (!result.success) {
      setDeleteError(result.error)
    }

    setIsDeleting(false)
  }

  // 返信フォーム送信成功時
  function handleReplySuccess() {
    setShowReplyForm(false)
  }

  return (
    <div
      className={cn(
        'relative',
        indentLevel > 0 && 'border-l-2 border-muted pl-4'
      )}
      style={{
        marginLeft: indentLevel > 0 ? `${Math.min(indentLevel, maxIndentDepth) * 16}px` : 0,
      }}
    >
      {/* コメントヘッダー */}
      <div className="flex items-start gap-3 mb-2">
        {/* アバター */}
        <div className="flex-shrink-0 w-8 h-8 rounded-full bg-muted flex items-center justify-center">
          <User className="w-4 h-4 text-muted-foreground" />
        </div>

        {/* 投稿者情報 */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{authorName}</span>
            {comment.author.type === 'guest' && (
              <span className="text-xs bg-muted px-1.5 py-0.5 rounded text-muted-foreground">
                ゲスト
              </span>
            )}
            <span className="text-xs text-muted-foreground">
              {formatDistanceToNow(new Date(comment.createdAt), {
                addSuffix: true,
                locale: ja,
              })}
            </span>
          </div>
        </div>
      </div>

      {/* コメント本文 */}
      <div className="ml-11 mb-3">
        <p className="text-sm whitespace-pre-wrap break-words">
          {escapeHtml(comment.content)}
        </p>
      </div>

      {/* アクションボタン */}
      <div className="ml-11 flex items-center gap-4 text-xs">
        {/* 返信ボタン */}
        <button
          type="button"
          onClick={() => setShowReplyForm(!showReplyForm)}
          className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          <MessageCircle className="w-3.5 h-3.5" />
          <span>返信</span>
        </button>

        {/* 返信を表示/非表示 */}
        {comment.replies.length > 0 && (
          <button
            type="button"
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
          >
            {collapsed ? (
              <>
                <ChevronDown className="w-3.5 h-3.5" />
                <span>返信を表示 ({comment.replyCount})</span>
              </>
            ) : (
              <>
                <ChevronUp className="w-3.5 h-3.5" />
                <span>返信を非表示</span>
              </>
            )}
          </button>
        )}

        {/* 削除ボタン（自分のコメントのみ） */}
        {isOwnComment && (
          <button
            type="button"
            onClick={handleDelete}
            disabled={isDeleting}
            className="flex items-center gap-1 text-muted-foreground hover:text-destructive transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span>{isDeleting ? '削除中...' : '削除'}</span>
          </button>
        )}
      </div>

      {/* 削除エラー */}
      {deleteError && (
        <div className="ml-11 mt-2 text-xs text-destructive">{deleteError}</div>
      )}

      {/* 返信フォーム */}
      {showReplyForm && (
        <div className="ml-11 mt-4">
          <CommentForm
            postId={postId}
            postSlug={postSlug}
            parentCommentId={comment.id}
            onSuccess={handleReplySuccess}
            isReply
          />
        </div>
      )}

      {/* ネストされた返信 */}
      {!collapsed && comment.replies.length > 0 && (
        <div className="mt-4 space-y-4">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              postId={postId}
              postSlug={postSlug}
              depth={depth + 1}
              maxIndentDepth={maxIndentDepth}
            />
          ))}
        </div>
      )}
    </div>
  )
}
