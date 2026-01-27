/**
 * コメント一覧（Server Component）
 *
 * ルートコメントを表示し、各コメントはCommentItemで再帰的にレンダリング
 */

import { CommentItem } from './CommentItem'
import type { CommentData } from '@/shared/lib/validations/comment'

type Props = {
  comments: CommentData[]
  postId: string
  /** Turnstile Site Key（DBから取得、nullの場合はTurnstile無効） */
  turnstileSiteKey: string | null
}

export function CommentList({
  comments,
  postId,
  turnstileSiteKey,
}: Props) {
  return (
    <div className="space-y-6">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postId={postId}
          depth={0}
          turnstileSiteKey={turnstileSiteKey}
        />
      ))}
    </div>
  )
}
