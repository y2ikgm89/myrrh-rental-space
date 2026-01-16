/**
 * SEOライブラリ
 *
 * メタデータ生成とJSON-LD構造化データの一元管理
 */

// メタデータファクトリ
export {
  getSeoSettings,
  generateHomeMetadata,
  generateArticleMetadata,
  generatePageMetadata,
  type SeoSettings,
  type ArticleMetadata,
} from './metadata-factory'

// JSON-LD設定
export {
  getWebSiteJsonLdData,
  getOrganizationJsonLdData,
  type WebSiteJsonLdData,
  type OrganizationJsonLdData,
} from './json-ld-config'
