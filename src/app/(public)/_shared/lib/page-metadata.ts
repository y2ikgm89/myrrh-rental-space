/**
 * ページメタデータ取得ユーティリティ
 *
 * Next.js 16 PPR対応:
 * - 'use cache' ディレクティブでキャッシュし、プリレンダリング時の動的データアクセスを回避
 * - データベースからSEO/OGP設定を取得
 */

import { cacheLife, cacheTag } from 'next/cache'
import type { Metadata } from 'next'
import { prisma } from '@/shared/lib/prisma'
import {
  SYSTEM_PAGES,
  getSystemPageDefinition,
  type SystemPageDefinition,
} from '@/shared/lib/validations/page'

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
  cacheTag('page-seo', `page-seo-${slug}`)

  const page = await prisma.page.findUnique({
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
 * ページのメタデータを生成
 *
 * データベースに設定がある場合はそれを使用し、
 * ない場合はデフォルト値を使用
 */
export async function generatePageMetadata(
  slug: string,
  fallback?: { title: string; description?: string }
): Promise<Metadata> {
  const seo = await getPageSeo(slug)
  const defaultSeo = getDefaultPageSeo(slug)

  // データベースの設定 > デフォルト設定 > フォールバック の優先順位
  const title = seo?.title || defaultSeo?.title || fallback?.title || slug
  const description =
    seo?.metaDescription ||
    seo?.description ||
    defaultSeo?.description ||
    fallback?.description

  const metadata: Metadata = {
    title,
    description,
  }

  // OGP設定
  if (seo?.ogpTitle || seo?.ogpDescription || seo?.ogpImageUrl) {
    metadata.openGraph = {
      title: seo.ogpTitle || title,
      description: seo.ogpDescription || description || undefined,
      ...(seo.ogpImageUrl && {
        images: [{ url: seo.ogpImageUrl }],
      }),
    }
  }

  // メタキーワード（SEO効果は限定的だが、設定されている場合は適用）
  if (seo?.metaKeywords) {
    metadata.keywords = seo.metaKeywords.split(',').map((k) => k.trim())
  }

  return metadata
}

/**
 * すべてのシステムページ定義を取得
 */
export function getAllSystemPages(): readonly SystemPageDefinition[] {
  return SYSTEM_PAGES
}
