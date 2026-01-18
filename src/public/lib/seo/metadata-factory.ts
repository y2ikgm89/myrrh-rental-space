/**
 * SEOメタデータ生成ファクトリ
 *
 * Settings DBから取得した設定を基にNext.jsメタデータを生成
 * Next.js 16 use cache ディレクティブによる明示的キャッシュ制御
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { prisma } from '@/shared/lib/prisma'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'

const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL || 'https://example.com'

// =============================================================================
// Types
// =============================================================================

export interface SeoSettings {
  siteName: string | null
  siteDescription: string | null
  defaultOgpImageUrl: string | null
  defaultMetaDescription: string | null
  defaultMetaKeywords: string | null
  defaultOgpTitle: string | null
  defaultOgpDescription: string | null
}

export interface ArticleMetadata {
  title: string
  description?: string | null
  image?: string | null
  ogpTitle?: string | null
  ogpDescription?: string | null
  metaKeywords?: string | null
}

// =============================================================================
// Data Fetching
// =============================================================================

/**
 * SEO設定を取得
 * キャッシュ: 1時間、設定更新時に無効化
 */
export async function getSeoSettings(): Promise<SeoSettings | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('seo-settings', 'settings')

  return safeFetch({
    fetch: () =>
      prisma.settings.findUnique({
        where: { id: 'singleton' },
        select: {
          siteName: true,
          siteDescription: true,
          defaultOgpImageUrl: true,
          defaultMetaDescription: true,
          defaultMetaKeywords: true,
          defaultOgpTitle: true,
          defaultOgpDescription: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getSeoSettings',
  })
}

// =============================================================================
// Metadata Generators
// =============================================================================

/**
 * ホームページメタデータ生成
 */
export async function generateHomeMetadata(): Promise<Metadata> {
  const settings = await getSeoSettings()

  const siteName = settings?.siteName || 'Myrrh Rental Space'
  const description =
    settings?.defaultOgpDescription ||
    settings?.defaultMetaDescription ||
    settings?.siteDescription ||
    'レンタルスペースの予約・管理サービス'
  const title = settings?.defaultOgpTitle || siteName
  const image = settings?.defaultOgpImageUrl || `${BASE_URL}/og-image.png`

  return {
    title: siteName,
    description,
    keywords: settings?.defaultMetaKeywords || undefined,
    alternates: {
      canonical: BASE_URL,
    },
    openGraph: {
      title,
      description,
      images: [image],
      type: 'website',
      url: BASE_URL,
      siteName,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

/**
 * 記事ページメタデータ生成（ブログ・ニュース共通）
 */
export function generateArticleMetadata(
  article: ArticleMetadata,
  options?: {
    canonicalUrl?: string
    siteName?: string
  }
): Metadata {
  const title = article.ogpTitle || article.title
  const description =
    article.ogpDescription || article.description || undefined

  return {
    title: article.title,
    description,
    keywords: article.metaKeywords || undefined,
    ...(options?.canonicalUrl && {
      alternates: {
        canonical: options.canonicalUrl,
      },
    }),
    openGraph: {
      title,
      description,
      images: article.image ? [article.image] : undefined,
      type: 'article',
      siteName: options?.siteName || 'Myrrh Rental Space',
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: article.image ? [article.image] : undefined,
    },
  }
}

/**
 * 汎用ページメタデータ生成
 */
export function generatePageMetadata(
  title: string,
  description: string,
  options?: {
    canonicalUrl?: string
    keywords?: string
    image?: string
    type?: 'website' | 'article'
    siteName?: string
  }
): Metadata {
  const image = options?.image || `${BASE_URL}/og-image.png`
  const siteName = options?.siteName || 'Myrrh Rental Space'

  return {
    title,
    description,
    keywords: options?.keywords,
    ...(options?.canonicalUrl && {
      alternates: {
        canonical: options.canonicalUrl,
      },
    }),
    openGraph: {
      title,
      description,
      images: [image],
      type: options?.type || 'website',
      siteName,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}
