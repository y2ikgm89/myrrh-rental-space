/**
 * ページメタデータ取得ユーティリティ
 *
 * 全ページ共通のメタデータ生成パイプライン。
 * DB（Pageテーブル）の SEO/OGP 設定を優先し、
 * 未設定フィールドは Settings フォールバック → デフォルト値の順で補完。
 *
 * Next.js 16 PPR対応:
 * - 'use cache' ディレクティブでキャッシュし、プリレンダリング時の動的データアクセスを回避
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS, getBaseUrl, SITE_DEFAULTS } from '@/shared/lib/constants'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { getSeoSettings } from '@/public/lib/seo/metadata-factory'
import {
  SYSTEM_PAGES,
  getSystemPageDefinition,
  type SystemPageDefinition,
} from '@/shared/lib/validations/page'
import { slugParamSchema } from '@/shared/lib/validations/params'

const BASE_URL = getBaseUrl()

/**
 * SEOデータ型
 */
export interface PageSeoData {
  title: string
  description: string | null
  metaDescription: string | null
  metaKeywords: string | null
  ogpTitle: string | null
  ogpDescription: string | null
  ogpImageUrl: string | null
}

/**
 * ページのSEO/OGP設定を取得
 *
 * Next.js 16 PPR: 'use cache' でプリレンダリング対応
 */
export async function getPageSeo(slug: string): Promise<PageSeoData | null> {
  'use cache'
  cacheLife('hours')
  cacheTag(CACHE_TAGS.PAGE_SEO, `${CACHE_TAGS.PAGE_SEO}-${slug}`)

  if (!slugParamSchema.safeParse(slug).success) return null

  const page = await safeFetch({
    fetch: () =>
      prisma.page.findUnique({
        where: { slug },
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
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getPageSeo',
  })

  return page
}

/**
 * システムページのデフォルトSEO設定を取得
 */
export function getDefaultPageSeo(slug: string): PageSeoData | null {
  const definition = getSystemPageDefinition(slug)
  if (!definition) return null

  return {
    title: definition.title,
    description: definition.description,
    metaDescription: definition.description,
    metaKeywords: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
  }
}

/**
 * ページのメタデータを生成（統一パイプライン）
 *
 * 優先順位: DB PageSEO設定 > Settings フォールバック > システムページデフォルト
 *
 * 生成項目:
 * - title / description
 * - canonical URL
 * - Open Graph (url, siteName, locale, images, type)
 * - Twitter Card (summary_large_image)
 * - keywords
 */
export async function generatePageMetadata(slug: string): Promise<Metadata> {
  // Page SEO と Settings を並列取得
  const [seo, settings] = await Promise.all([
    getPageSeo(slug),
    getSeoSettings(),
  ])
  const defaultSeo = getDefaultPageSeo(slug)

  const siteName = settings?.siteName ?? SITE_DEFAULTS.name

  // タイトル: DB > デフォルト > slug
  const title = seo?.title || defaultSeo?.title || slug

  // 説明文: DB metaDescription > DB description > Settings > デフォルト
  const description =
    seo?.metaDescription ||
    seo?.description ||
    settings?.defaultMetaDescription ||
    defaultSeo?.description ||
    undefined

  // OGP タイトル/説明: DB OGP > Settings OGP > 通常値
  const ogTitle = seo?.ogpTitle || settings?.defaultOgpTitle || title
  const ogDescription = seo?.ogpDescription || settings?.defaultOgpDescription || description

  // OGP 画像: DB > Settings デフォルト
  const ogImage = seo?.ogpImageUrl || settings?.defaultOgpImageUrl || undefined

  // canonical URL: 'home' はルート URL、それ以外は /{slug}
  const canonicalUrl = slug === 'home' ? `${BASE_URL}/` : `${BASE_URL}/${slug}`

  const metadata: Metadata = {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      title: ogTitle,
      description: ogDescription ?? undefined,
      url: canonicalUrl,
      siteName,
      locale: 'ja_JP',
      type: 'website',
      ...(ogImage && { images: [{ url: ogImage }] }),
    },
    twitter: {
      card: 'summary_large_image',
      title: ogTitle,
      description: ogDescription ?? undefined,
      ...(ogImage && { images: [ogImage] }),
    },
  }

  // メタキーワード
  if (seo?.metaKeywords || settings?.defaultMetaKeywords) {
    const keywords = seo?.metaKeywords || settings?.defaultMetaKeywords || ''
    metadata.keywords = keywords.split(',').map((k) => k.trim())
  }

  return metadata
}

/**
 * すべてのシステムページ定義を取得
 */
export function getAllSystemPages(): readonly SystemPageDefinition[] {
  return SYSTEM_PAGES
}
