/**
 * お知らせ詳細ページ
 *
 * 個別のお知らせ記事を表示するServer Component。
 *
 * ## 機能
 * - お知らせ記事の詳細表示
 * - 構造化データ（NewsArticle JSON-LD）の出力
 * - 動的メタデータ生成
 *
 * ## Next.js 16 PPR対応
 * - `use cache` ディレクティブでデータ取得をキャッシュ
 * - `generateStaticParams` でビルド時に事前生成
 *
 * @module news/[slug]/page
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { tv } from 'tailwind-variants'
import { buttonVariants } from '@/public/components/ui'
import { ContentRenderer } from '@/public/components/ContentRenderer'
import { NewsArticleJsonLd } from '@/public/components/seo/JsonLd'
import { Suspense } from 'react'
import { prisma } from '@/shared/lib/prisma'
import { isAdmin } from '@/shared/lib/auth'
import { criticalFetch, ErrorCategory } from '@/shared/lib/errors'
import { toPlainObject, toISOString, formatSerializedDate } from '@/shared/lib/serialize'
import { cn } from '@/shared/lib/utils'
import { getNewsLayoutSettings } from '@/public/lib/layout-settings'
import { getContainerStyles, getContentStyles } from '@/shared/lib/styles/layout-mapper'
import { getBaseUrl, CACHE_LIFE, CACHE_TAGS } from '@/shared/lib/constants'
import { NewsPreviewWrapper, InlineEditableWrapper } from './_components'
import type { ReactElement } from 'react'

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl()

// =============================================================================
// Types
// =============================================================================

/** ページコンポーネントのProps */
interface PageProps {
  params: Promise<{ slug: string }>
  searchParams: Promise<{ preview?: string; edit?: string }>
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * お知らせ詳細を取得（キャッシュ付き）
 *
 * 公開中のお知らせを取得し、シリアライズして返します。
 *
 * @param slug - お知らせのスラッグ
 * @returns お知らせデータ、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力（エラーは再スロー）
 */
async function getNewsBySlug(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.NEWS, `${CACHE_TAGS.NEWS}-slug-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.news.findUnique({
        where: {
          slug,
          isPublished: true,
          publishedAt: { not: null },
        },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getNewsBySlug',
    context: { newsSlug: slug },
  })

  return toPlainObject(result)
}

/**
 * メタデータ用お知らせ情報を取得（キャッシュ付き）
 *
 * generateMetadata で使用する最小限の情報のみ取得します。
 *
 * @param slug - お知らせのスラッグ
 * @returns タイトルとコンテンツ、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力（エラーは再スロー）
 */
async function getNewsForMetadata(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.METADATA)
  cacheTag(CACHE_TAGS.NEWS, `${CACHE_TAGS.NEWS}-slug-${slug}`)

  const result = await criticalFetch({
    fetch: () =>
      prisma.news.findUnique({
        where: { slug },
        select: { title: true, content: true },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getNewsForMetadata',
    context: { newsSlug: slug },
  })

  return toPlainObject(result)
}

// =============================================================================
// Static Generation
// =============================================================================

/**
 * 静的パラメータ生成
 *
 * ビルド時に公開中のお知らせページを事前生成します。
 * 最大100件まで事前生成し、それ以降はオンデマンドで生成されます。
 *
 * @returns お知らせslugの配列
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.NEWS)

  try {
    const news = await prisma.news.findMany({
      where: {
        isPublished: true,
        publishedAt: { not: null },
      },
      select: { slug: true },
      take: 100,
    })

    if (news.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return news.map((item) => ({
      slug: item.slug,
    }))
  } catch {
    return [{ slug: '__placeholder__' }]
  }
}

// =============================================================================
// Styles
// =============================================================================

/**
 * ページスタイル定義
 *
 * tailwind-variants を使用したスタイル管理
 */
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

// =============================================================================
// Helpers
// =============================================================================

/**
 * 公開日を表示用に整形する
 *
 * シリアライズ後は Date が ISO 文字列になるため、両方の形式に対応します。
 *
 * @param value - 日付値（Date | string | null）
 * @returns フォーマット済み日付文字列、値がない場合は「公開準備中」
 */
function formatPublishedDate(value: Date | string | null): string {
  if (!value) return '公開準備中'
  return formatSerializedDate(value)
}

// =============================================================================
// Metadata
// =============================================================================

/**
 * 動的メタデータ生成
 *
 * お知らせのタイトルと本文からメタデータを生成します。
 * 本文からHTMLタグを除去し、160文字に切り詰めて description として使用します。
 *
 * @param props - ページProps（params含む）
 * @returns Next.js Metadata オブジェクト
 */
export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  const { slug } = await params

  const news = await getNewsForMetadata(slug)

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

// =============================================================================
// Page Component
// =============================================================================

/**
 * お知らせ詳細ページコンポーネント
 *
 * 個別のお知らせ記事を表示するServer Component。
 * 構造化データ（NewsArticle JSON-LD）も出力します。
 *
 * @param props - ページProps（params, searchParams含む）
 * @returns ページのReact要素
 */
export default async function NewsDetailPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  const { slug } = await params
  const { preview } = await searchParams

  // プレビューモードの場合はクライアントコンポーネントを表示
  if (preview === 'true') {
    return <NewsPreviewWrapper slug={slug} />
  }

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const news = await getNewsBySlug(slug)

  if (!news) {
    notFound()
  }

  // 管理者チェック（インライン編集用）
  const userIsAdmin = await isAdmin()

  // レイアウト設定を取得（IDで取得）
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
        url={`${BASE_URL}/news/${news.slug}`}
        datePublished={toISOString(news.publishedAt) || toISOString(news.updatedAt) || ''}
        dateModified={toISOString(news.updatedAt) || ''}
      />

      <div className={`${styles.container()} ${containerStyles.className}`} style={containerStyles.style}>
        <article className={`${styles.article()} ${contentStyles.className}`} style={contentStyles.style}>
          <header className={styles.header()}>
            <h1 className={styles.title()}>{news.title}</h1>
            <time
              className={styles.date()}
              dateTime={toISOString(news.publishedAt)}
            >
              {formatPublishedDate(news.publishedAt)}
            </time>
          </header>

          {/* 本文 - インライン編集対応 */}
          <Suspense fallback={<ContentRenderer html={news.content} />}>
            <InlineEditableWrapper
              newsId={news.id}
              initialContent={news.content}
              isAdmin={userIsAdmin}
              contentWidthClassName={contentStyles.className}
              contentWidthStyle={contentStyles.style}
            >
              <ContentRenderer html={news.content} />
            </InlineEditableWrapper>
          </Suspense>

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
