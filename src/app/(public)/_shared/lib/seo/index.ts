/**
 * SEOライブラリ
 *
 * メタデータ生成とJSON-LD構造化データの一元管理
 */

// メタデータファクトリ
export {
  getSeoSettings,
  generateArticleMetadata,
  type SeoSettings,
  type ArticleMetadata,
} from "./metadata-factory";

// JSON-LD設定
export {
  getWebSiteJsonLdData,
  getOrganizationJsonLdData,
  getLocalBusinessJsonLdData,
  getGraphJsonLdData,
  type WebSiteJsonLdData,
  type OrganizationJsonLdData,
  type LocalBusinessJsonLdData,
  type GraphJsonLdData,
} from "./json-ld-config";
