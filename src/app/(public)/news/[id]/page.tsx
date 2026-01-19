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
import { buttonVariants } from '@/public/components/ui'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { NewsArticleJsonLd } from '@/public/components/seo/JsonLd'
import { prisma } from '@/shared/lib/prisma'
import { cn } from '@/shared/lib/utils'
import { getNewsLayoutSettings } from '@/public/lib/layout-settings'
import { getContainerStyles, getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { NewsStatus } from '@/shared/generated/prisma/enums'
import { getBaseUrl } from '@/shared/lib/constants'
import type { ReactElement } from 'react'

const BASE_URL = getBaseUrl()

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
      status: NewsStatus.PUBLISHED,
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
        status: NewsStatus.PUBLISHED,
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
    container: 'mx-auto w-full px-4 sm:px-6 lg:px-8',
    article: '', // 幅はgetContentStylesで動的に設定
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

  // レイアウト設定を取得
  const layoutConfig = await getNewsLayoutSettings(news.id)
  const containerStyles = getContainerStyles(layoutConfig)
  const contentStyles = getContentStyles(layoutConfig)

  // 構造化データ用のプレーンテキスト説明文を生成
  const plainText = (news.content || '').replace(/<[^>]*>/g, '').trim()
  const description =
    plainText.length > 160
      ? plainText.slice(0, 160) + '...'
      : plainText || 'お知らせの詳細'

  return (
    <section className={styles.section()}>
      {/* 構造化データ: NewsArticle */}
      <NewsArticleJsonLd
        headline={news.title}
        description={description}
        url={`${BASE_URL}/news/${news.id}`}
        datePublished={news.publishedAt?.toISOString() || news.updatedAt.toISOString()}
        dateModified={news.updatedAt.toISOString()}
      />

      <div className={`${styles.container()} ${containerStyles.className}`} style={containerStyles.style}>
        <article className={`${styles.article()} ${contentStyles.className}`} style={contentStyles.style}>
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
      </div>
    </section>
  )
}
