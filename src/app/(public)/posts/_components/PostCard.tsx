'use client'

import Image from 'next/image'
import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent, CardFooter } from '@/public/components/ui'
import { cn } from '@/shared/lib/utils'
import { parseStringArray } from '@/shared/lib/json-validators'
import { generatePostUrl, generateCategoryUrl, generateTagUrl } from '@/shared/lib/url'
import type { ReactElement } from 'react'

// =============================================================================
// Styles
// =============================================================================

const styles = tv({
  slots: {
    card: 'group relative h-full overflow-hidden transition-shadow hover:shadow-lg',
    imageWrapper: 'relative aspect-[4/3] overflow-hidden rounded-t-lg',
    image: 'object-cover transition-transform duration-300 group-hover:scale-105',
    cardTitle: 'text-lg font-semibold text-foreground line-clamp-2',
    // ストレッチドリンク: タイトルをカード全体のクリック領域にする
    titleLink: [
      'after:absolute after:inset-0 after:z-0',
      'hover:underline focus:outline-none focus-visible:ring-2 focus-visible:ring-ring',
    ],
    excerpt: 'mt-2 text-sm text-muted-foreground line-clamp-3',
    meta: 'flex flex-wrap items-center gap-2 text-xs text-muted-foreground',
    // カテゴリー/タグリンクはz-indexを高くしてストレッチドリンクより上に配置
    interactiveLink: 'relative z-10 hover:text-foreground transition-colors',
    tag: 'relative z-10 rounded-full bg-muted px-2 py-1 text-xs text-muted-foreground hover:bg-muted-foreground/20 transition-colors',
    tagActive: 'relative z-10 rounded-full bg-primary px-2 py-1 text-xs text-primary-foreground hover:bg-primary/80 transition-colors',
  },
})()

// =============================================================================
// Types
// =============================================================================

export interface PostListItem {
  id: string
  title: string
  slug: string
  excerpt: string | null
  thumbnailUrl: string | null
  publishedAt: Date | null
  tags: unknown
  category: {
    name: string
    slug: string
  }
}

interface PostCardProps {
  post: PostListItem
  index: number
  /** 投稿URLのプレフィックス（'/posts' または ''） */
  postPrefix: string
  /** タグページでカレントタグをハイライト表示する場合に指定 */
  highlightTag?: string
}

// =============================================================================
// Helpers
// =============================================================================

function formatPublishedDate(value: Date | null): string {
  if (!value) return '公開準備中'
  return value.toLocaleDateString('ja-JP')
}

// =============================================================================
// Component
// =============================================================================

/**
 * 投稿カードコンポーネント
 *
 * クリッカブルカードパターン実装:
 * - カード全体がクリック可能（タイトルのストレッチドリンクによる）
 * - カテゴリー・タグリンクは独立してクリック可能（z-indexで上に配置）
 * - ネストされた<a>タグを回避し、有効なHTML構造を維持
 */
export function PostCard({ post, index, postPrefix, highlightTag }: PostCardProps): ReactElement {
  const tags = parseStringArray(post.tags)
  const thumbnailUrl = post.thumbnailUrl || '/images/placeholder-post.jpg'

  return (
    <Card className={styles.card()}>
      <div className={styles.imageWrapper()}>
        <Image
          src={thumbnailUrl}
          alt={post.title}
          fill
          priority={index < 2}
          sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
          className={styles.image()}
        />
      </div>
      <CardContent className="p-4">
        <div className={styles.meta()}>
          <Link
            href={generateCategoryUrl(post.category.slug, postPrefix)}
            className={styles.interactiveLink()}
          >
            {post.category.name}
          </Link>
          <span aria-hidden="true">•</span>
          <span>{formatPublishedDate(post.publishedAt)}</span>
        </div>
        <h3 className={styles.cardTitle()}>
          <Link href={generatePostUrl(post, { structure: 'post-name', prefix: postPrefix })} className={styles.titleLink()}>
            {post.title}
          </Link>
        </h3>
        <p className={styles.excerpt()}>{post.excerpt}</p>
      </CardContent>
      <CardFooter className={cn('p-4 pt-0', styles.meta())}>
        {tags.length > 0 ? (
          tags.slice(0, 3).map((tag) => (
            <Link
              key={tag}
              href={generateTagUrl(tag, postPrefix)}
              className={tag === highlightTag ? styles.tagActive() : styles.tag()}
            >
              #{tag}
            </Link>
          ))
        ) : (
          <span className={styles.tag()}>タグ未設定</span>
        )}
      </CardFooter>
    </Card>
  )
}
