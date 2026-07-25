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

export interface ResolvedSiteBranding {
  siteName: string;
  description: string;
  ogTitle: string;
  ogDescription: string;
}

export function nonEmpty(value: string | null | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

/**
 * ページメタ description の解決順:
 * page SEO → defaultMetaDescription → siteDescription → system page default → SITE_DEFAULTS
 */
export function resolvePageDescription(
  settings: SeoSettings | null,
  pageMeta: string | null | undefined,
  systemDefault: string | null | undefined,
): string {
  return (
    nonEmpty(pageMeta) ??
    nonEmpty(settings?.defaultMetaDescription) ??
    nonEmpty(settings?.siteDescription) ??
    nonEmpty(systemDefault) ??
    SITE_DEFAULTS.description
  );
}

/**
 * SettingsSeo からサイト共通ブランディングを解決する。
 * null / 空文字は SITE_DEFAULTS にフォールバック。
 */
export function resolveSiteBranding(
  settings: SeoSettings | null,
): ResolvedSiteBranding {
  const siteName = nonEmpty(settings?.siteName) ?? SITE_DEFAULTS.name;
  const description =
    nonEmpty(settings?.defaultMetaDescription) ??
    nonEmpty(settings?.siteDescription) ??
    SITE_DEFAULTS.description;
  const ogTitle = nonEmpty(settings?.defaultOgpTitle) ?? siteName;
  const ogDescription =
    nonEmpty(settings?.defaultOgpDescription) ?? description;

  return { siteName, description, ogTitle, ogDescription };
}

/**
 * 記事ページメタデータ生成（ブログ・ニュース・スペース・イベント・タクソノミー共通）
 *
 * settings には `getSeoSettings()` の戻り値を渡す。article の各フィールドが null/空のときに
 * 管理画面で設定した SEO defaults（defaultOgpImageUrl / defaultMetaDescription /
 * defaultOgpTitle / defaultOgpDescription / defaultMetaKeywords / siteName）を fallback として
 * マージする。これを渡さないと管理画面の OGP defaults が silently 効かない。
 */
export function generateArticleMetadata(
  article: ArticleMetadata,
  settings?: SeoSettings | null,
  options?: {
    canonicalUrl?: string;
    siteName?: string;
    /** OGP の type。スペース・イベント等の永続コンテンツは "website"、ブログ・お知らせは "article"。既定 "article"。 */
    ogType?: "article" | "website";
  },
): Metadata {
  const branding = resolveSiteBranding(settings ?? null);
  const description = nonEmpty(article.description) ?? branding.description;
  const keywords =
    article.metaKeywords ?? settings?.defaultMetaKeywords ?? undefined;
  const image = article.image ?? settings?.defaultOgpImageUrl ?? undefined;
  const ogTitle =
    nonEmpty(article.ogpTitle) ?? branding.ogTitle ?? article.title;
  const ogDescription =
    nonEmpty(article.ogpDescription) ?? branding.ogDescription;
  const siteName = options?.siteName ?? branding.siteName;
  const ogType = options?.ogType ?? "article";

  return {
    title: article.title,
    ...(description !== undefined && { description }),
    ...(keywords !== undefined && { keywords }),
    ...(options?.canonicalUrl && {
      alternates: {
        canonical: options.canonicalUrl,
      },
    }),
    openGraph: {
      title: ogTitle,
      ...(ogDescription !== undefined && { description: ogDescription }),
      ...(image !== undefined && { images: [image] }),
      type: ogType,
      locale: "ja_JP",
      siteName,
      ...(options?.canonicalUrl && { url: options.canonicalUrl }),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      ...(ogDescription !== undefined && { description: ogDescription }),
      ...(image !== undefined && { images: [image] }),
    },
  };
}
