/**
 * ニュース一覧コンポーネント
 *
 * @description お知らせ一覧のグリッド表示
 */

import { tv } from 'tailwind-variants'
import { NewsCard } from './NewsCard'
import type { News } from '@/shared/generated/prisma/client'
import type { ReactElement } from 'react'

const styles = tv({
  slots: {
    grid: 'grid gap-6 sm:grid-cols-2 lg:grid-cols-3',
    emptyState: 'text-center py-16 text-muted-foreground',
  },
})()

export interface NewsListProps {
  newsList: Pick<News, 'id' | 'slug' | 'title' | 'content' | 'publishedAt'>[]
}

export function NewsList({ newsList }: NewsListProps): ReactElement {
  if (newsList.length === 0) {
    return (
      <div className={styles.emptyState()}>
        <p>お知らせはまだありません。</p>
      </div>
    )
  }

  return (
    <div className={styles.grid()}>
      {newsList.map((news) => (
        <NewsCard key={news.id} news={news} />
      ))}
    </div>
  )
}
