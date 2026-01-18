/**
 * レイアウト設定管理
 *
 * サイト全体および個別コンテンツのレイアウト幅設定を管理
 * キャッシュ付きで設定を取得し、個別設定とサイト設定をマージ
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { LayoutWidth } from '@/shared/types/prisma'
import { type LayoutConfig, DEFAULT_LAYOUT_CONFIG } from '@/shared/types/layout'

// Re-export for convenience
export type { LayoutConfig } from '@/shared/types/layout'

// =============================================================================
// Site Layout Settings
// =============================================================================

/**
 * サイト全体のレイアウト設定を取得（キャッシュ付き）
 */
export async function getSiteLayoutSettings(): Promise<LayoutConfig> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings', 'layout-settings')

  const settings = await prisma.settings.findUnique({
    where: { id: 'singleton' },
    select: {
      containerWidth: true,
      containerWidthCustom: true,
      contentWidth: true,
      contentWidthCustom: true,
    },
  })

  if (!settings) {
    return DEFAULT_LAYOUT_CONFIG
  }

  return {
    containerWidth: settings.containerWidth ?? DEFAULT_LAYOUT_CONFIG.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth ?? DEFAULT_LAYOUT_CONFIG.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
  }
}

// =============================================================================
// Content-specific Layout Settings
// =============================================================================

/**
 * ブログ記事のレイアウト設定を取得（個別設定 || サイト設定）
 */
export async function getBlogLayoutSettings(postId: string): Promise<LayoutConfig> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings', 'layout-settings', `blog-${postId}`)

  const [siteSettings, postSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.blogPost.findUnique({
      where: { id: postId },
      select: {
        contentWidth: true,
        contentWidthCustom: true,
      },
    }),
  ])

  // 個別設定がnullの場合はサイト設定を使用
  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: postSettings?.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom: postSettings?.contentWidthCustom ?? siteSettings.contentWidthCustom,
  }
}

/**
 * ニュースのレイアウト設定を取得
 */
export async function getNewsLayoutSettings(newsId: string): Promise<LayoutConfig> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings', 'layout-settings', `news-${newsId}`)

  const [siteSettings, newsSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.news.findUnique({
      where: { id: newsId },
      select: {
        contentWidth: true,
        contentWidthCustom: true,
      },
    }),
  ])

  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: newsSettings?.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom: newsSettings?.contentWidthCustom ?? siteSettings.contentWidthCustom,
  }
}

/**
 * 静的ページのレイアウト設定を取得
 */
export async function getPageLayoutSettings(slug: string): Promise<LayoutConfig> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings', 'layout-settings', `page-${slug}`)

  const [siteSettings, pageSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.page.findUnique({
      where: { slug },
      select: {
        contentWidth: true,
        contentWidthCustom: true,
      },
    }),
  ])

  return {
    containerWidth: siteSettings.containerWidth,
    containerWidthCustom: siteSettings.containerWidthCustom,
    contentWidth: pageSettings?.contentWidth ?? siteSettings.contentWidth,
    contentWidthCustom: pageSettings?.contentWidthCustom ?? siteSettings.contentWidthCustom,
  }
}

// =============================================================================
// Helpers
// =============================================================================

/**
 * コンテンツ幅設定のみを取得するヘルパー
 * ContentRendererに渡す用
 */
export function getContentWidthFromConfig(config: LayoutConfig): {
  width: LayoutWidth
  customWidth: number | null
} {
  return {
    width: config.contentWidth,
    customWidth: config.contentWidthCustom,
  }
}
