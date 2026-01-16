/**
 * お知らせセクション（新API対応）
 *
 * HomepageSectionData.config から設定を受け取りレンダリング
 */

import Link from 'next/link'
import { tv } from 'tailwind-variants'
import { Container, buttonVariants } from '@/components/site/ui'
import { getPublishedNewsList } from '@/actions/admin/news'
import { cn } from '@/lib/utils'
import type { NewsConfig } from '@/lib/validations/homepage-section'
import type { ReactElement } from 'react'

const newsSectionVariants = tv({
  slots: {
    section: 'py-16 sm:py-20 lg:py-24',
    header: 'text-center mb-12',
    sectionTitle: 'text-2xl sm:text-3xl lg:text-4xl font-bold tracking-tight',
    list: 'divide-y border-y',
    item: 'flex items-start gap-4 py-4 hover:bg-muted/30 transition-colors px-2 -mx-2 rounded',
    date: 'flex-shrink-0 text-sm text-muted-foreground min-w-[100px]',
    content: 'flex-1 min-w-0',
    newsTitle: 'font-medium line-clamp-1 group-hover:text-primary transition-colors',
    footer: 'mt-10 text-center',
  },
})

const styles = newsSectionVariants()

interface NewsSectionRendererProps {
  title?: string | null
  config: NewsConfig
}

export async function NewsSectionRenderer({
  title: customTitle,
  config,
}: NewsSectionRendererProps): Promise<ReactElement | null> {
  const newsItems = await getPublishedNewsList({
    take: config.maxItems,
  })

  if (newsItems.length === 0) {
    return null
  }

  const displayTitle = customTitle || config.title

  return (
    <section className={styles.section()}>
      <Container size="md">
        <div className={styles.header()}>
          <h2 className={styles.sectionTitle()}>{displayTitle}</h2>
        </div>
        <div className={styles.list()}>
          {newsItems.map((news) => (
            <Link
              key={news.id}
              href={`/news/${news.id}`}
              className={cn(styles.item(), 'group')}
            >
              <span className={styles.date()}>
                {new Date(news.publishedAt!).toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                })}
              </span>
              <div className={styles.content()}>
                <h3 className={styles.newsTitle()}>{news.title}</h3>
              </div>
            </Link>
          ))}
        </div>
        {config.showViewAllLink && (
          <div className={styles.footer()}>
            <Link href="/news" className={cn(buttonVariants({ variant: 'outline' }))}>
              お知らせ一覧を見る
            </Link>
          </div>
        )}
      </Container>
    </section>
  )
}
