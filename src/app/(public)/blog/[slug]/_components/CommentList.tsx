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
  postSlug: string
}

export function CommentList({ comments, postId, postSlug }: Props) {
  return (
    <div className="space-y-6">
      {comments.map((comment) => (
        <CommentItem
          key={comment.id}
          comment={comment}
          postId={postId}
          postSlug={postSlug}
          depth={0}
        />
      ))}
    </div>
  )
}
