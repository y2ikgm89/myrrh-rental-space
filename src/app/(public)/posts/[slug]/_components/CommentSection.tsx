/**
 * コメントセクション（Server Component）
 *
 * ブログ記事詳細ページに表示するコメント機能のメインコンテナ
 */

import { connection } from 'next/server'
import { getCommentsByPostId } from '@/public/actions/post-comment'
import { getTurnstileSiteKey } from '@/public/actions/settings'
import { CommentList } from './CommentList'
import { CommentForm } from './CommentForm'
import type { CommentData } from '@/shared/lib/validations/comment'

type Props = {
  postId: string
}

export async function CommentSection({ postId }: Props) {
  // 動的レンダリングにopt-in（コメントは動的コンテンツ）
  await connection()

  const [comments, turnstileSiteKey] = await Promise.all([
    getCommentsByPostId(postId),
    getTurnstileSiteKey(),
  ])
  const totalCount = comments.reduce(
    (acc: number, comment: CommentData) => acc + 1 + countReplies(comment.replies),
    0
  )

  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="text-2xl font-bold mb-6">
        コメント {totalCount > 0 && `(${totalCount})`}
      </h2>

      {/* コメント投稿フォーム */}
      <div className="mb-8">
        <CommentForm
          postId={postId}
          turnstileSiteKey={turnstileSiteKey}
        />
      </div>

      {/* コメント一覧 */}
      {comments.length > 0 ? (
        <CommentList
          comments={comments}
          postId={postId}
          turnstileSiteKey={turnstileSiteKey}
        />
      ) : (
        <p className="text-muted-foreground text-center py-8">
          まだコメントはありません。最初のコメントを投稿してみましょう！
        </p>
      )}
    </section>
  )
}

/**
 * 返信数を再帰的にカウント
 */
function countReplies(replies: CommentData[]): number {
  let count = 0
  for (const reply of replies) {
    count += 1
    if (reply.replies.length > 0) {
      count += countReplies(reply.replies)
    }
  }
  return count
}
