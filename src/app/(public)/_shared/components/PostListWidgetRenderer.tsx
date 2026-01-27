/**
 * PostListWidgetRenderer
 *
 * 公開ページで記事リストウィジェットを表示するServer Component
 */

import Link from 'next/link'
import Image from 'next/image'
import { format } from 'date-fns'
import { ja } from 'date-fns/locale'
import {
  getRecentPosts,
  getPopularPosts,
  getRelatedPosts,
  type PostSummary,
} from '@/public/lib/post-queries'
import { logger } from '@/shared/lib/logger'
import { generatePostUrl } from '@/shared/lib/url'

type WidgetType = 'recent' | 'popular' | 'related'

interface PostListWidgetRendererProps {
  type: WidgetType
  count: number
  categoryId?: string | null
  title?: string | null
  excludePostId?: string
  postPrefix: string
}

const WIDGET_CONFIG: Record<WidgetType, { defaultTitle: string; icon: string }> = {
  recent: { defaultTitle: '最新記事', icon: '🕐' },
  popular: { defaultTitle: '人気記事', icon: '🔥' },
  related: { defaultTitle: '関連記事', icon: '📎' },
}

export async function PostListWidgetRenderer({
  type,
  count,
  categoryId,
  title,
  excludePostId,
  postPrefix,
}: PostListWidgetRendererProps) {
  // タイプに応じてデータ取得（エラーハンドリング付き）
  let posts: PostSummary[]

  try {
    switch (type) {
      case 'recent':
        posts = await getRecentPosts(count)
        break
      case 'popular':
        posts = await getPopularPosts(count)
        break
      case 'related':
        posts = await getRelatedPosts(categoryId ?? null, excludePostId, count)
        break
      default:
        posts = await getRecentPosts(count)
    }
  } catch (error) {
    logger.error('PostListWidget: Failed to fetch posts', { error: error instanceof Error ? error.message : String(error) })
    return null
  }

  if (posts.length === 0) {
    return null
  }

  const config = WIDGET_CONFIG[type]
  const displayTitle = title || config.defaultTitle

  return (
    <div className="my-8 rounded-lg border bg-muted/30 p-4">
      {/* ヘッダー */}
      <h3 className="mb-4 flex items-center gap-2 text-lg font-bold">
        <span>{config.icon}</span>
        <span>{displayTitle}</span>
      </h3>

      {/* 記事リスト */}
      <div className="space-y-3">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={generatePostUrl(post, { structure: 'post-name', prefix: postPrefix })}
            className="group flex gap-3 rounded-lg p-2 transition-colors hover:bg-muted"
          >
            {/* サムネイル */}
            <div className="relative h-16 w-20 flex-shrink-0 overflow-hidden rounded bg-muted">
              {post.thumbnailUrl ? (
                <Image
                  src={post.thumbnailUrl}
                  alt={post.title}
                  fill
                  sizes="80px"
                  className="object-cover transition-transform group-hover:scale-105"
                  loading="lazy"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-2xl text-muted-foreground">
                  📄
                </div>
              )}
            </div>

            {/* コンテンツ */}
            <div className="flex-1 min-w-0">
              <p className="line-clamp-2 text-sm font-medium leading-tight group-hover:text-primary">
                {post.title}
              </p>
              <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                {post.publishedAt && (
                  <time dateTime={post.publishedAt.toISOString()}>
                    {format(post.publishedAt, 'yyyy/MM/dd', { locale: ja })}
                  </time>
                )}
                {post.category && (
                  <>
                    <span>・</span>
                    <span>{post.category.name}</span>
                  </>
                )}
                {type === 'popular' && (
                  <>
                    <span>・</span>
                    <span>{post.viewCount.toLocaleString()} views</span>
                  </>
                )}
              </div>
            </div>
          </Link>
        ))}
      </div>
    </div>
  )
}
