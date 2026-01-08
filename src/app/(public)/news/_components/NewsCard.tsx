/**
 * ニュースカードコンポーネント
 *
 * @description お知らせ一覧で使用する個別カードを表示
 */

import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Card, CardContent } from '@/components/site/ui'
import type { News } from '@/generated/prisma/client/client'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    cardWrapper: 'block',
    card: 'h-full transition-shadow hover:shadow-lg',
    content: 'p-6',
    date: 'text-sm text-muted-foreground mb-2',
    title: 'text-lg font-semibold text-foreground line-clamp-2',
    excerpt: 'mt-2 text-sm text-muted-foreground line-clamp-3',
  },
})()

/**
 * 公開日を表示用に整形する
 */
function formatPublishedDate(value: Date | null): string {
  if (!value) return '公開準備中'
  return value.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

/**
 * コンテンツから抜粋を生成する
 */
function generateExcerpt(content: string, maxLength: number = 100): string {
  const plainText = content.replace(/<[^>]*>/g, '').trim()
  if (plainText.length <= maxLength) {
    return plainText
  }
  return plainText.slice(0, maxLength) + '...'
}

export interface NewsCardProps {
  news: Pick<News, 'id' | 'title' | 'content' | 'publishedAt'>
}

export function NewsCard({ news }: NewsCardProps): ReactElement {
  const excerpt = generateExcerpt(news.content)

  return (
    <Link
      href={`/news/${news.id}`}
      className={styles.cardWrapper()}
      aria-label={news.title}
    >
      <Card className={styles.card()}>
        <CardContent className={styles.content()}>
          <time
            className={styles.date()}
            dateTime={news.publishedAt?.toISOString()}
          >
            {formatPublishedDate(news.publishedAt)}
          </time>
          <h3 className={styles.title()}>{news.title}</h3>
          <p className={styles.excerpt()}>{excerpt}</p>
        </CardContent>
      </Card>
    </Link>
  )
}
