/**
 * SEOメタデータ生成ファクトリ
 *
 * Settings domain から取得した設定を基にNext.jsメタデータを生成
 */

import type { Metadata } from "next";
import { SITE_DEFAULTS } from "@/shared/lib/constants";
import {
  getSeoSettings,
  type SeoSettings,
} from "@/shared/domain/settings/queries/site";

// =============================================================================
// Types
// =============================================================================

export interface ArticleMetadata {
  title: string;
  description?: string | null;
  image?: string | null;
  ogpTitle?: string | null;
  ogpDescription?: string | null;
  metaKeywords?: string | null;
}

export { getSeoSettings, type SeoSettings };

/**
 * 記事ページメタデータ生成（ブログ・ニュース共通）
 */
export function generateArticleMetadata(
  article: ArticleMetadata,
  options?: {
    canonicalUrl?: string;
    siteName?: string;
  },
): Metadata {
  const title = article.ogpTitle || article.title;
  const description =
    article.ogpDescription || article.description || undefined;

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
      type: "article",
      locale: "ja_JP",
      siteName: options?.siteName || SITE_DEFAULTS.name,
      ...(options?.canonicalUrl && { url: options.canonicalUrl }),
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
      images: article.image ? [article.image] : undefined,
    },
  };
}
