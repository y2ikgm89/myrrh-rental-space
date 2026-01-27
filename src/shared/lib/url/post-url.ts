/**
 * 投稿URL生成ユーティリティ
 *
 * パーマリンク設定に基づいて投稿記事のURLを生成します。
 * postUrlPrefixEnabled 設定により、/posts/ プレフィックスの有無を制御します。
 *
 * @module shared/lib/url/post-url
 */

// =============================================================================
// Types
// =============================================================================

/** パーマリンク構造タイプ */
export type PermalinkStructure = 'post-name' | 'date-name' | 'category-name'

/** URL生成に必要な記事データ */
export interface PostUrlData {
  slug: string
  publishedAt?: Date | string | null
  category?: {
    slug: string
  } | null
}

/** パーマリンク設定 */
export interface PermalinkConfig {
  structure: PermalinkStructure
  /** プレフィックス（'/posts' または ''） */
  prefix?: string
}

// =============================================================================
// URL Generation
// =============================================================================

/**
 * 投稿記事のURLを生成
 *
 * @param post - 記事データ
 * @param config - パーマリンク設定
 * @returns 生成されたURL（先頭に/を含む相対パス）
 *
 * @example
 * ```ts
 * // プレフィックス有効 + post-name: /posts/article-title
 * generatePostUrl(post, { structure: 'post-name', prefix: '/posts' })
 *
 * // プレフィックス無効 + post-name: /article-title
 * generatePostUrl(post, { structure: 'post-name', prefix: '' })
 *
 * // プレフィックス有効 + date-name: /posts/2026/01/article-title
 * generatePostUrl(post, { structure: 'date-name', prefix: '/posts' })
 *
 * // プレフィックス有効 + category-name: /posts/category-slug/article-title
 * generatePostUrl(post, { structure: 'category-name', prefix: '/posts' })
 * ```
 */
export function generatePostUrl(
  post: PostUrlData,
  config: PermalinkConfig
): string {
  const { slug, publishedAt, category } = post
  const { structure, prefix = '/posts' } = config

  let path: string
  switch (structure) {
    case 'date-name': {
      // /2026/01/article-title
      const date = publishedAt ? new Date(publishedAt) : new Date()
      const year = date.getFullYear()
      const month = String(date.getMonth() + 1).padStart(2, '0')
      path = `/${year}/${month}/${slug}`
      break
    }

    case 'category-name': {
      // /category-slug/article-title
      const categorySlug = category?.slug ?? 'uncategorized'
      path = `/${categorySlug}/${slug}`
      break
    }

    case 'post-name':
    default:
      // /article-title
      path = `/${slug}`
  }

  return `${prefix}${path}`
}

/**
 * 投稿一覧ページのURLを生成
 *
 * @param prefix - プレフィックス（'/posts' または ''）
 * @param params - クエリパラメータ（オプション）
 * @returns 投稿一覧URL
 */
export function generatePostListUrl(
  prefix: string,
  params?: { category?: string; tags?: string; q?: string }
): string {
  const base = prefix || '/'
  if (!params) return base

  const searchParams = new URLSearchParams()
  if (params.category) searchParams.set('category', params.category)
  if (params.tags) searchParams.set('tags', params.tags)
  if (params.q) searchParams.set('q', params.q)

  const query = searchParams.toString()
  return query ? `${base}?${query}` : base
}

/**
 * カテゴリページのURLを生成
 *
 * @param categorySlug - カテゴリスラッグ
 * @param prefix - プレフィックス（'/posts' または ''）
 * @returns カテゴリページURL
 */
export function generateCategoryUrl(categorySlug: string, prefix: string): string {
  return `${prefix}/category/${categorySlug}`
}

/**
 * タグページのURLを生成
 *
 * @param tagSlug - タグスラッグ
 * @param prefix - プレフィックス（'/posts' または ''）
 * @returns タグページURL
 */
export function generateTagUrl(tagSlug: string, prefix: string): string {
  return `${prefix}/tag/${tagSlug}`
}

/**
 * URLパターンを生成（プレビュー用）
 *
 * @param structure - パーマリンク構造
 * @returns パターン文字列
 */
export function getUrlPattern(structure: PermalinkStructure): string {
  switch (structure) {
    case 'date-name':
      return '/:year/:month/:slug'
    case 'category-name':
      return '/:category/:slug'
    case 'post-name':
    default:
      return '/:slug'
  }
}

/**
 * URLからスラッグを抽出
 *
 * @param pathname - URLパス
 * @param config - パーマリンク設定
 * @returns 抽出されたスラッグ、抽出できない場合はnull
 */
export function extractSlugFromUrl(
  pathname: string,
  config: PermalinkConfig
): string | null {
  const { structure } = config
  const segments = pathname.split('/').filter(Boolean)

  switch (structure) {
    case 'date-name':
      // /2026/01/article-title → segments = ['2026', '01', 'article-title']
      if (segments.length === 3) {
        return segments[2]
      }
      break

    case 'category-name':
      // /category-slug/article-title → segments = ['category-slug', 'article-title']
      if (segments.length === 2 && !isReservedPath(segments[0])) {
        return segments[1]
      }
      break

    case 'post-name':
    default:
      // /article-title → segments = ['article-title']
      if (segments.length === 1 && !isReservedPath(segments[0])) {
        return segments[0]
      }
  }

  return null
}

/**
 * URLがパーマリンク設定に一致するか検証
 *
 * @param pathname - URLパス
 * @param config - パーマリンク設定
 * @returns 一致する場合はtrue
 */
export function matchesPostUrl(
  pathname: string,
  config: PermalinkConfig
): boolean {
  const { structure } = config
  const segments = pathname.split('/').filter(Boolean)

  switch (structure) {
    case 'date-name': {
      // /yyyy/mm/slug の形式
      if (segments.length !== 3) return false
      const year = parseInt(segments[0], 10)
      const month = parseInt(segments[1], 10)
      return (
        year >= 2000 &&
        year <= 2100 &&
        month >= 1 &&
        month <= 12 &&
        !isReservedPath(segments[2])
      )
    }

    case 'category-name':
      // /category/slug の形式（カテゴリが予約語でないこと）
      return segments.length === 2 && !isReservedPath(segments[0])

    case 'post-name':
    default:
      // /slug の形式（予約語でないこと）
      return segments.length === 1 && !isReservedPath(segments[0])
  }
}

// =============================================================================
// Helpers
// =============================================================================

/** 予約済みパス（simple構造で除外） */
const RESERVED_PATHS = new Set([
  'about',
  'contact',
  'faq',
  'news',
  'reservation',
  'spaces',
  'terms',
  'privacy',
  'api',
  'admin',
  '_next',
])

/**
 * 予約済みパスかどうかを判定
 */
function isReservedPath(segment: string): boolean {
  return RESERVED_PATHS.has(segment.toLowerCase())
}
