/**
 * キャッシュ設定定数
 *
 * Next.js 16 PPR の `cacheLife` ディレクティブで使用するキャッシュ期間設定
 *
 * @see https://nextjs.org/docs/app/api-reference/directives/use-cache
 *
 * @example
 * ```typescript
 * import { CACHE_LIFE } from '@/shared/lib/constants'
 *
 * async function getData() {
 *   'use cache'
 *   cacheLife(CACHE_LIFE.PUBLIC_CONTENT)
 *   // ...
 * }
 * ```
 */

/**
 * キャッシュ有効期間の設定
 *
 * Next.js 16 の cacheLife() で使用可能な値:
 * - 'seconds' | 'minutes' | 'hours' | 'days' | 'weeks' | 'max'
 */
export const CACHE_LIFE = {
  /**
   * 公開コンテンツ（ブログ、ニュース、スペース、ページ）
   * - 頻繁に更新されないが、適度に最新を保つ
   */
  PUBLIC_CONTENT: "hours",

  /**
   * 静的設定（サイト設定、ナビゲーション）
   * - 管理画面で変更されるまで長期間有効
   */
  STATIC_SETTINGS: "days",

  /**
   * 動的データ（予約状況、在庫など）
   * - 頻繁に更新される可能性がある
   */
  DYNAMIC_DATA: "minutes",

  /**
   * メタデータ・SEO関連
   * - 公開コンテンツと同期
   */
  METADATA: "hours",

  /**
   * 最大有効期間（Next.js 16 公式推奨: stale-while-revalidate 用途）
   * - cron / webhook で `revalidateTag(tag, CACHE_LIFE.MAX)` として使用
   * - stale 5分 / revalidate 1ヶ月 / expire 1年
   * - 「次回以降のリクエストで再検証すれば良い」非同期再検証シナリオ
   */
  MAX: "max",
} as const;

/**
 * キャッシュタグのプレフィックス
 *
 * updateTag() / revalidateTag() で使用するタグ名の一元管理
 *
 * @example
 * ```typescript
 * import { CACHE_TAGS, getCacheTag } from '@/shared/lib/constants'
 *
 * // タグ付け
 * cacheTag(getCacheTag.posts.detail(slug))
 *
 * // 無効化
 * revalidateTag(CACHE_TAGS.POSTS)
 * ```
 */
export const CACHE_TAGS = {
  /** 投稿記事 */
  POSTS: "posts",
  /** 投稿カテゴリ */
  POST_CATEGORIES: "post-categories",
  /** 投稿タグ */
  POST_TAGS: "post-tags",
  /** 投稿コメント */
  POST_COMMENTS: "post-comments",
  /** お知らせ */
  NEWS: "news",
  /** スペース */
  SPACES: "spaces",
  /** スペースカテゴリ */
  SPACE_CATEGORIES: "space-categories",
  /** ロケーション */
  LOCATIONS: "locations",
  /** カスタムページ */
  PAGES: "pages",
  /** 通知設定 */
  NOTIFICATION_SETTINGS: "notification-settings",
  /** 連携設定（Stripe/GCal/iCal） */
  INTEGRATION_SETTINGS: "integration-settings",
  /** FAQ */
  FAQ: "faq",
  /** 予約 */
  RESERVATIONS: "reservations",
  /** 顧客 */
  CUSTOMERS: "customers",
  /** お問い合わせ */
  INQUIRIES: "inquiries",
  /** メディア */
  MEDIA: "media",
  /** ナビゲーション */
  NAVIGATION: "navigation",
  /** アナウンスバー */
  ANNOUNCEMENT_BAR: "announcement-bar",
  /** セクション全体 */
  SECTIONS: "sections",
  /** ページセクション */
  PAGE_SECTIONS: "page-sections",
  /** 利用規約 */
  TERMS: "terms",
  /** スタッフ */
  STAFF: "staff",
  /** クーポン */
  COUPONS: "coupons",
  /** ビジネス設定（営業時間・NAP情報等） */
  BUSINESS_SETTINGS: "business-settings",
  /** Cookie同意設定 */
  COOKIE_CONSENT: "cookie-consent",
  /** XMLサイトマップ（/sitemap.xml） */
  SITEMAP: "sitemap",
  /** レイアウト詳細設定（コンテンツ幅等） */
  LAYOUT_SETTINGS: "layout-settings",
  /** アナリティクス設定 */
  ANALYTICS_CONFIG: "analytics-config",
  /** SEO設定（メタデータファクトリ用） */
  SEO_SETTINGS: "seo-settings",
  /** 組織設定（JSON-LD用） */
  ORGANIZATION_SETTINGS: "organization-settings",
  /** ソーシャルリンク */
  SOCIAL_LINKS: "social-links",
  /** ページSEO */
  PAGE_SEO: "page-seo",
  /** サイドバーデータ */
  SIDEBAR_DATA: "sidebar-data",
  /** サイドバー設定 */
  SIDEBAR_SETTINGS: "sidebar-settings",
  /** Instagramフィード */
  INSTAGRAM_FEED: "instagram-feed",
  /** ブロックテンプレート */
  BLOCK_TEMPLATES: "block-templates",
  /** スペースレビュー */
  REVIEWS: "reviews",
  /** 機能モジュール ON/OFF（Settings.featureModules） */
  FEATURE_MODULES: "feature-modules",
  /** イベント */
  EVENTS: "events",
  /** 送信前 suppression（Resend webhook で HARD_BOUNCED / COMPLAINED 観測済みの宛先 Set） */
  SUPPRESSED_EMAILS: "suppressed-emails",
} as const;

/**
 * 階層的キャッシュタグ生成ヘルパー
 *
 * @example
 * ```typescript
 * // 詳細ページのタグ
 * cacheTag(getCacheTag.posts.detail(slug))
 *
 * // 無効化（詳細のみ）
 * revalidateTag(getCacheTag.posts.detail(slug))
 *
 * // 無効化（リスト全体）
 * revalidateTag(CACHE_TAGS.POSTS)
 * ```
 */
export const getCacheTag = {
  posts: {
    detail: (slug: string) => `${CACHE_TAGS.POSTS}-${slug}`,
    tags: () => CACHE_TAGS.POST_TAGS,
    tagPage: (slug: string) => `${CACHE_TAGS.POST_TAGS}-${slug}`,
  },
  news: {
    detail: (id: string) => `${CACHE_TAGS.NEWS}-${id}`,
  },
  spaces: {
    detail: (id: string) => `${CACHE_TAGS.SPACES}-${id}`,
  },
  pages: {
    detail: (slug: string) => `${CACHE_TAGS.PAGES}-${slug}`,
  },
  faq: {
    detail: (id: string) => `${CACHE_TAGS.FAQ}-${id}`,
  },
  terms: {
    detail: (slug: string) => `${CACHE_TAGS.TERMS}-${slug}`,
    footer: () => `${CACHE_TAGS.TERMS}-footer`,
  },
  reservations: {
    detail: (id: string) => `${CACHE_TAGS.RESERVATIONS}-${id}`,
    calendar: () => `${CACHE_TAGS.RESERVATIONS}-calendar`,
  },
  customers: {
    detail: (id: string) => `${CACHE_TAGS.CUSTOMERS}-${id}`,
  },
  inquiries: {
    detail: (id: string) => `${CACHE_TAGS.INQUIRIES}-${id}`,
  },
  coupons: {
    detail: (id: string) => `${CACHE_TAGS.COUPONS}-${id}`,
  },
  media: {
    detail: (id: string) => `${CACHE_TAGS.MEDIA}-${id}`,
  },
  staff: {
    detail: (id: string) => `${CACHE_TAGS.STAFF}-${id}`,
  },
  layoutSettings: {
    site: () => CACHE_TAGS.LAYOUT_SETTINGS,
  },
  pageSeo: {
    detail: (slug: string) => `${CACHE_TAGS.PAGE_SEO}-${slug}`,
  },
  reviews: {
    space: (spaceId: string) => `${CACHE_TAGS.REVIEWS}-space-${spaceId}`,
    stats: (spaceId: string) => `${CACHE_TAGS.REVIEWS}-stats-${spaceId}`,
  },
  auditLogs: {
    recent: (userId: string) => `audit-logs:recent:${userId}`,
  },
} as const;

/** キャッシュ有効期間の型 */
export type CacheLife = (typeof CACHE_LIFE)[keyof typeof CACHE_LIFE];

/** キャッシュタグの型 */
export type CacheTag = (typeof CACHE_TAGS)[keyof typeof CACHE_TAGS];
