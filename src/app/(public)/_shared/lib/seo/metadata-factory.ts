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
import { SITE_DEFAULTS, CACHE_TAGS } from '@/shared/lib/constants'

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
  cacheTag(CACHE_TAGS.SEO_SETTINGS, CACHE_TAGS.SETTINGS)

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
      siteName: options?.siteName || SITE_DEFAULTS.name,
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: article.image ? [article.image] : undefined,
    },
  }
}
