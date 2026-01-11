/**
 * お知らせ詳細ページ
 *
 * @description 個別のお知らせ記事を表示
 */

import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { Container, buttonVariants } from '@/components/site/ui'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import type { ReactElement } from 'react'
import { NewsContent } from './_components/NewsContent'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * 静的パラメータ生成
 * 公開中のお知らせをビルド時に事前生成
 */
export async function generateStaticParams() {
  const news = await prisma.news.findMany({
    where: {
      isPublished: true,
      publishedAt: { not: null },
    },
    select: { id: true },
  })

  return news.map((item) => ({
    id: item.id,
  }))
}

const styles = tv({
  slots: {
    section: 'py-16 bg-background min-h-screen',
    article: 'max-w-3xl mx-auto',
    header: 'mb-8',
    title: 'text-3xl font-bold tracking-tight text-foreground',
    date: 'mt-2 text-sm text-muted-foreground',
    backLink: 'mt-12 flex justify-center',
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

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { id } = await params

  const news = await prisma.news.findUnique({
    where: { id },
    select: { title: true, content: true },
  })

  if (!news) {
    return {
      title: 'お知らせが見つかりません',
    }
  }

  const plainText = news.content.replace(/<[^>]*>/g, '').trim()
  const description =
    plainText.length > 160 ? plainText.slice(0, 160) + '...' : plainText

  return {
    title: news.title,
    description,
    openGraph: {
      title: news.title,
      description,
      type: 'article',
    },
  }
}

export default async function NewsDetailPage({
  params,
}: PageProps): Promise<ReactElement> {
  const { id } = await params

  const news = await prisma.news.findUnique({
    where: {
      id,
      isPublished: true,
      publishedAt: { not: null },
    },
  })

  if (!news) {
    notFound()
  }

  return (
    <section className={styles.section()}>
      <Container>
        <article className={styles.article()}>
          <header className={styles.header()}>
            <h1 className={styles.title()}>{news.title}</h1>
            <time
              className={styles.date()}
              dateTime={news.publishedAt?.toISOString()}
            >
              {formatPublishedDate(news.publishedAt)}
            </time>
          </header>

          <NewsContent content={news.content} />

          <div className={styles.backLink()}>
            <Link
              href="/news"
              className={cn(buttonVariants({ variant: 'outline' }))}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                className="mr-2"
                aria-hidden="true"
              >
                <path d="m15 18-6-6 6-6" />
              </svg>
              お知らせ一覧に戻る
            </Link>
          </div>
        </article>
      </Container>
    </section>
  )
}
