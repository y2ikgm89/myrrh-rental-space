/**
 * コメントセクション（Server Component）
 *
 * ブログ記事詳細ページに表示するコメント機能のメインコンテナ
 */

import { connection } from 'next/server'
import { getCommentsByPostId } from '@/actions/blog-comment'
import { CommentList } from './CommentList'
import { CommentForm } from './CommentForm'
import type { CommentData } from '@/lib/validations/comment'

type Props = {
  postId: string
  postSlug: string
}

export async function CommentSection({ postId, postSlug }: Props) {
  // 動的レンダリングにopt-in（コメントは動的コンテンツ）
  await connection()

  const comments = await getCommentsByPostId(postId)
  const totalCount = comments.reduce(
    (acc, comment) => acc + 1 + countReplies(comment.replies),
    0
  )

  return (
    <section className="mt-12 border-t pt-8">
      <h2 className="text-2xl font-bold mb-6">
        コメント {totalCount > 0 && `(${totalCount})`}
      </h2>

      {/* コメント投稿フォーム */}
      <div className="mb-8">
        <CommentForm postId={postId} postSlug={postSlug} />
      </div>

      {/* コメント一覧 */}
      {comments.length > 0 ? (
        <CommentList
          comments={comments}
          postId={postId}
          postSlug={postSlug}
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
