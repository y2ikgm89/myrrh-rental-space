/**
 * レイアウト設定管理
 *
 * サイト全体および個別コンテンツのレイアウト幅設定を管理
 * キャッシュ付きで設定を取得し、個別設定とサイト設定をマージ
 */

import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import { CACHE_TAGS, CACHE_LIFE, getCacheTag } from '@/shared/lib/constants'
import { LayoutWidth } from '@/shared/types/prisma'
import type { LayoutConfig } from '@/shared/types/layout'
import { slugParamSchema, idParamSchema } from '@/shared/lib/validations/params'

// =============================================================================
// Fallback Config (DB未設定時のデフォルト値)
// =============================================================================

const FALLBACK_LAYOUT_CONFIG: LayoutConfig = {
  containerWidth: LayoutWidth.LG,
  containerWidthCustom: null,
  contentWidth: LayoutWidth.MD,
  contentWidthCustom: null,
}

// =============================================================================
// Site Layout Settings
// =============================================================================

/**
 * サイト全体のレイアウト設定を取得（キャッシュ付き）
 */
export async function getSiteLayoutSettings(): Promise<LayoutConfig> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(CACHE_TAGS.SETTINGS, CACHE_TAGS.LAYOUT_SETTINGS)

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
    return FALLBACK_LAYOUT_CONFIG
  }

  return {
    containerWidth: settings.containerWidth ?? FALLBACK_LAYOUT_CONFIG.containerWidth,
    containerWidthCustom: settings.containerWidthCustom,
    contentWidth: settings.contentWidth ?? FALLBACK_LAYOUT_CONFIG.contentWidth,
    contentWidthCustom: settings.contentWidthCustom,
  }
}

// =============================================================================
// Content-specific Layout Settings
// =============================================================================

/**
 * 投稿記事のレイアウト設定を取得（個別設定 || サイト設定）
 */
export async function getPostLayoutSettings(postId: string): Promise<LayoutConfig> {
  'use cache'
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(
    CACHE_TAGS.SETTINGS,
    getCacheTag.layoutSettings.site(),
    getCacheTag.layoutSettings.post(postId)
  )

  if (!idParamSchema.safeParse(postId).success) return FALLBACK_LAYOUT_CONFIG

  const [siteSettings, postSettings] = await Promise.all([
    getSiteLayoutSettings(),
    prisma.post.findUnique({
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
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(
    CACHE_TAGS.SETTINGS,
    getCacheTag.layoutSettings.site(),
    getCacheTag.layoutSettings.news(newsId)
  )

  if (!idParamSchema.safeParse(newsId).success) return FALLBACK_LAYOUT_CONFIG

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
  cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
  cacheTag(
    CACHE_TAGS.SETTINGS,
    getCacheTag.layoutSettings.site(),
    getCacheTag.layoutSettings.page(slug)
  )

  if (!slugParamSchema.safeParse(slug).success) return FALLBACK_LAYOUT_CONFIG

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
