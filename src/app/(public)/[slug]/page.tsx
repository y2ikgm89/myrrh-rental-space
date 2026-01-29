/**
 * カスタムページ公開表示
 *
 * DBに保存されたページを表示するServer Component。
 * サイドバー表示設定に対応しています。
 *
 * ## 機能
 * - ページコンテンツの表示（セクションシステム対応）
 * - サイドバー（ページ設定による表示切替）
 * - 構造化データ（Breadcrumb JSON-LD）の出力
 *
 * ## Next.js 16 PPR対応
 * - `use cache` ディレクティブでデータ取得をキャッシュ
 * - `generateStaticParams` でビルド時に事前生成
 *
 * @module [slug]/page
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { notFound } from 'next/navigation'
import { BreadcrumbJsonLd } from '@/public/components/seo/JsonLd'
import { PageSections } from '@/public/components/page-sections'
import { prisma } from '@/shared/lib/prisma'
import { criticalFetch, ErrorCategory } from '@/shared/lib/errors'
import { toPlainObject } from '@/shared/lib/serialize'
import { getBaseUrl, CACHE_LIFE, CACHE_TAGS } from '@/shared/lib/constants'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'
import type { ReactElement } from 'react'

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl()

/**
 * 予約済みスラッグ
 *
 * Next.js のルーティングで固定ルートと衝突するスラッグ
 * これらは [slug] では処理せず、専用ルートで処理される
 */
const RESERVED_SLUGS = [
  // コンテンツルート
  'news',        // /news, /news/[slug]
  'posts',       // /posts, /posts/[slug]
  'category',    // /category/[slug]
  'tag',         // /tag/[slug]
  // 専用ページ
  'faq',         // /faq
  'about',       // /about
  'contact',     // /contact
  'reservation', // /reservation
  'privacy',     // /privacy
  'terms',       // /terms
  'spaces',      // /spaces, /spaces/[slug]
]

// =============================================================================
// Types
// =============================================================================

/** ページコンポーネントのProps */
interface PageProps {
  params: Promise<{ slug: string }>
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * ページを取得（キャッシュ付き）
 *
 * 公開中のページを取得し、シリアライズして返します。
 * セクションモードが有効な場合はセクションデータも含めて取得します。
 *
 * @param slug - ページのスラッグ
 * @returns ページデータ、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getPage(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.PAGES, `${CACHE_TAGS.PAGES}-${slug}`, `${CACHE_TAGS.PAGES}-sections-${slug}`)

  // 予約済みスラッグは処理しない
  if (RESERVED_SLUGS.includes(slug)) {
    return null
  }

  const result = await criticalFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: {
          slug,
          isPublished: true,
          isActive: true,
        },
        select: {
          id: true,
          title: true,
          slug: true,
          description: true,
          metaDescription: true,
          metaKeywords: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
          showSidebar: true,
          contentWidth: true,
          contentWidthCustom: true,
          sections: {
            where: { isActive: true },
            select: {
              id: true,
              pageId: true,
              type: true,
              title: true,
              config: true,
              content: true,
              order: true,
              isActive: true,
            },
            orderBy: { order: 'asc' },
          },
        },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getPage',
    context: { slug },
  })

  return toPlainObject(result)
}

/**
 * メタデータ用ページ情報を取得（キャッシュ付き）
 *
 * generateMetadata で使用する最小限の情報のみ取得します。
 *
 * @param slug - ページのスラッグ
 * @returns メタデータ用情報、存在しない場合は null
 * @throws criticalFetch 内でDBエラーをログ出力
 */
async function getPageForMetadata(slug: string) {
  'use cache'
  cacheLife(CACHE_LIFE.METADATA)
  cacheTag(CACHE_TAGS.PAGES, `${CACHE_TAGS.PAGES}-${slug}`)

  // 予約済みスラッグは処理しない
  if (RESERVED_SLUGS.includes(slug)) {
    return null
  }

  const result = await criticalFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: {
          slug,
          isPublished: true,
          isActive: true,
        },
        select: {
          title: true,
          description: true,
          metaDescription: true,
          metaKeywords: true,
          ogpTitle: true,
          ogpDescription: true,
          ogpImageUrl: true,
        },
      }),
    category: ErrorCategory.DATABASE,
    operationName: 'getPageForMetadata',
    context: { slug },
  })

  return toPlainObject(result)
}

// =============================================================================
// Metadata
// =============================================================================

/**
 * 動的メタデータ生成
 *
 * ページのタイトル、説明、OGP情報からメタデータを生成します。
 *
 * @param props - ページProps（params含む）
 * @returns Next.js Metadata オブジェクト
 */
export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params

  const page = await getPageForMetadata(slug)

  if (!page) {
    return {
      title: 'ページが見つかりません',
    }
  }

  const title = page.ogpTitle || page.title
  const description = page.ogpDescription || page.metaDescription || page.description || undefined

  return {
    title: page.title,
    description,
    keywords: page.metaKeywords || undefined,
    openGraph: {
      title,
      description,
      images: page.ogpImageUrl ? [page.ogpImageUrl] : undefined,
      type: 'website',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: page.ogpImageUrl ? [page.ogpImageUrl] : undefined,
    },
  }
}

// =============================================================================
// Static Generation
// =============================================================================

/**
 * 静的パラメータ生成
 *
 * ビルド時に公開中のページを事前生成します。
 * 予約済みスラッグは除外され、最大100件まで事前生成されます。
 *
 * @returns ページスラッグの配列
 */
export async function generateStaticParams(): Promise<Array<{ slug: string }>> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.PAGES)

  try {
    const pages = await prisma.page.findMany({
      where: {
        isPublished: true,
        isActive: true,
        slug: { notIn: RESERVED_SLUGS },
      },
      select: { slug: true },
      take: 100,
    })

    if (pages.length === 0) {
      return [{ slug: '__placeholder__' }]
    }

    return pages.map((page) => ({
      slug: page.slug,
    }))
  } catch {
    return [{ slug: '__placeholder__' }]
  }
}

// =============================================================================
// Page Component
// =============================================================================

/**
 * ページコンポーネント
 *
 * DBに保存されたページを表示するServer Component。
 * サイドバー表示はページ設定に応じて切り替わります。
 *
 * @param props - ページProps（params含む）
 * @returns ページのReact要素
 */
export default async function SlugPage({ params }: PageProps): Promise<ReactElement> {
  const { slug } = await params

  // プレースホルダーの場合は404
  if (slug === '__placeholder__') {
    notFound()
  }

  const page = await getPage(slug)

  if (!page || !page.sections || page.sections.length === 0) {
    notFound()
  }

  const postPrefix = await getPostUrlPrefix()

  return (
    <>
      {/* 構造化データ: パンくずリスト */}
      <BreadcrumbJsonLd
        items={[
          { name: 'ホーム', url: BASE_URL },
          { name: page.title, url: `${BASE_URL}/${page.slug}` },
        ]}
      />

      {/* セクションベースのレンダリング */}
      <PageSections
        sections={page.sections}
        postPrefix={postPrefix}
      />
    </>
  )
}
