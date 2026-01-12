/**
 * お知らせ詳細ページ
 *
 * @description 個別のお知らせ記事を表示
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでデータ取得をキャッシュ
 * - generateStaticParams でビルド時に事前生成
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { Container, buttonVariants } from '@/components/site/ui'
import { ContentRenderer } from '@/components/site/ContentRenderer'
import { prisma } from '@/lib/prisma'
import { cn } from '@/lib/utils'
import type { ReactElement } from 'react'

interface PageProps {
  params: Promise<{ id: string }>
}

/**
 * お知らせ詳細を取得（キャッシュ付き）
 */
async function getNewsById(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('news', `news-${id}`)

  return await prisma.news.findUnique({
    where: {
      id,
      isPublished: true,
      publishedAt: { not: null },
    },
  })
}

/**
 * メタデータ用お知らせ情報を取得（キャッシュ付き）
 */
async function getNewsForMetadata(id: string) {
  'use cache'
  cacheLife('hours')
  cacheTag('news', `news-${id}`)

  return await prisma.news.findUnique({
    where: { id },
    select: { title: true, content: true },
  })
}

/**
 * 静的パラメータ生成
 * 公開中のお知らせをビルド時に事前生成
 */
export async function generateStaticParams() {
  'use cache'
  cacheLife('hours')
  cacheTag('news')

  try {
    const news = await prisma.news.findMany({
      where: {
        isPublished: true,
        publishedAt: { not: null },
      },
      select: { id: true },
      take: 100,
    })

    if (news.length === 0) {
      return [{ id: '__placeholder__' }]
    }

    return news.map((item) => ({
      id: item.id,
    }))
  } catch {
    return [{ id: '__placeholder__' }]
  }
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

  const news = await getNewsForMetadata(id)

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

  // プレースホルダーの場合は404
  if (id === '__placeholder__') {
    notFound()
  }

  const news = await getNewsById(id)

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

          <ContentRenderer html={news.content} />

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
