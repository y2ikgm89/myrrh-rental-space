/**
 * XMLサイトマップ生成
 *
 * Google公式ガイドラインに準拠:
 * - priority/changefreq は Google が無視するため不使用
 * - lastmod は実際のコンテンツ更新日を使用
 * - 正規化された絶対URLのみ含める
 *
 * @see https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap
 * @see https://nextjs.org/docs/app/api-reference/file-conventions/metadata/sitemap
 */

import type { MetadataRoute } from 'next'
import { prisma } from '@/shared/lib/prisma'
import { PostStatus } from '@/shared/generated/prisma/enums'
import { getBaseUrl } from '@/shared/lib/constants'
import { getPostUrlPrefix } from '@/shared/lib/settings/public'

// =============================================================================
// Types
// =============================================================================

type SitemapEntry = MetadataRoute.Sitemap[number]

// =============================================================================
// Constants
// =============================================================================

const BASE_URL = getBaseUrl()

/**
 * 静的ページの定義
 *
 * lastModified は設定で管理されないため、
 * ビルド時の日付を使用（実質的に変更頻度が低いページ）
 */
const STATIC_PAGES = [
  '/',
  '/about',
  '/contact',
  '/faq',
  '/reservation',
  '/terms',
  '/privacy',
] as const

// =============================================================================
// Sitemap Generation
// =============================================================================

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  // 設定と全データを並列取得
  const [
    postPrefix,
    spaces,
    news,
    posts,
    postCategories,
    postTags,
    customPages,
  ] = await Promise.all([
    // 投稿URLプレフィックス設定
    getPostUrlPrefix(),
    // 公開中のスペース
    prisma.space.findMany({
      where: { isPublished: true, isActive: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // 公開中のお知らせ
    prisma.news.findMany({
      where: { isPublished: true },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // 公開中の投稿
    prisma.post.findMany({
      where: { status: PostStatus.PUBLISHED },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // 投稿カテゴリ（投稿が1件以上あるもの）
    prisma.postCategory.findMany({
      where: {
        posts: { some: { status: PostStatus.PUBLISHED } },
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // 投稿タグ（全て - タグページは常に存在する）
    prisma.postTag.findMany({
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
    // 公開中のカスタムページ（システムページ以外）
    prisma.page.findMany({
      where: {
        isPublished: true,
        isActive: true,
        isSystemPage: false,
      },
      select: { slug: true, updatedAt: true },
      orderBy: { updatedAt: 'desc' },
    }),
  ])

  // 各コンテンツタイプの最新更新日を取得
  const latestSpaceUpdate = spaces[0]?.updatedAt ?? new Date()
  const latestNewsUpdate = news[0]?.updatedAt ?? new Date()
  const latestPostUpdate = posts[0]?.updatedAt ?? new Date()

  const entries: SitemapEntry[] = []

  // ==========================================================================
  // 1. 静的ページ
  // ==========================================================================
  for (const path of STATIC_PAGES) {
    entries.push({
      url: `${BASE_URL}${path}`,
      lastModified: new Date(),
    })
  }

  // ==========================================================================
  // 2. 一覧ページ（各コンテンツの最新更新日を使用）
  // ==========================================================================
  entries.push({
    url: `${BASE_URL}/spaces`,
    lastModified: latestSpaceUpdate,
  })
  entries.push({
    url: `${BASE_URL}/news`,
    lastModified: latestNewsUpdate,
  })
  // 投稿一覧ページ（プレフィックスが有効な場合のみ）
  if (postPrefix) {
    entries.push({
      url: `${BASE_URL}${postPrefix}`,
      lastModified: latestPostUpdate,
    })
  }

  // ==========================================================================
  // 3. スペース詳細ページ
  // ==========================================================================
  for (const space of spaces) {
    entries.push({
      url: `${BASE_URL}/spaces/${space.slug}`,
      lastModified: space.updatedAt,
    })
  }

  // ==========================================================================
  // 4. お知らせ詳細ページ
  // ==========================================================================
  for (const item of news) {
    entries.push({
      url: `${BASE_URL}/news/${item.slug}`,
      lastModified: item.updatedAt,
    })
  }

  // ==========================================================================
  // 5. 投稿詳細ページ
  // ==========================================================================
  for (const post of posts) {
    entries.push({
      url: `${BASE_URL}${postPrefix}/${post.slug}`,
      lastModified: post.updatedAt,
    })
  }

  // ==========================================================================
  // 6. 投稿カテゴリページ
  // ==========================================================================
  for (const category of postCategories) {
    entries.push({
      url: `${BASE_URL}${postPrefix}/category/${category.slug}`,
      lastModified: category.updatedAt,
    })
  }

  // ==========================================================================
  // 7. 投稿タグページ
  // ==========================================================================
  for (const tag of postTags) {
    entries.push({
      url: `${BASE_URL}${postPrefix}/tag/${tag.slug}`,
      lastModified: tag.updatedAt,
    })
  }

  // ==========================================================================
  // 8. カスタムページ
  // ==========================================================================
  for (const page of customPages) {
    entries.push({
      url: `${BASE_URL}/${page.slug}`,
      lastModified: page.updatedAt,
    })
  }

  return entries
}
