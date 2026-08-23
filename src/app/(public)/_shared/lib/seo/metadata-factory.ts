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
import {
  resolveOpenGraphImages,
  resolveTwitterImages,
} from "@/public/lib/seo/default-social-images";
import { buildAlternates } from "./feed-alternates";

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
 * settings には `getSeoSettings()` の戻り値を渡す。`generatePageMetadata` と同じ OGP 解決順:
 *
 * - **meta description** (`description` / `<meta name="description">`):
 *   `article.description` → settings defaultMetaDescription / siteDescription → SITE_DEFAULTS
 * - **og:title**: `article.ogpTitle` → `settings.defaultOgpTitle` → `article.title`
 *   （`branding.ogTitle` / siteName は使わない — article.title へのフォールバックを阻害するため）
 * - **og:description**: `article.ogpDescription` → `settings.defaultOgpDescription` → 上記 meta description
 *
 * 画像・キーワードは settings の defaultOgpImageUrl / defaultMetaKeywords を fallback としてマージする。
 */
export async function generateArticleMetadata(
  article: ArticleMetadata,
  settings?: SeoSettings | null,
  options?: {
    canonicalUrl?: string;
    siteName?: string;
    /** OGP の type。スペース・イベント等の永続コンテンツは "website"、ブログ・お知らせは "article"。既定 "article"。 */
    ogType?: "article" | "website";
  },
): Promise<Metadata> {
  const branding = resolveSiteBranding(settings ?? null);
  const description = nonEmpty(article.description) ?? branding.description;
  const keywords =
    article.metaKeywords ?? settings?.defaultMetaKeywords ?? undefined;
  const image = article.image ?? settings?.defaultOgpImageUrl ?? undefined;
  const ogTitle =
    nonEmpty(article.ogpTitle) ??
    nonEmpty(settings?.defaultOgpTitle) ??
    article.title;
  const ogDescription =
    nonEmpty(article.ogpDescription) ??
    nonEmpty(settings?.defaultOgpDescription) ??
    description;
  const siteName = options?.siteName ?? branding.siteName;
  const ogType = options?.ogType ?? "article";

  return {
    title: article.title,
    ...(description !== undefined && { description }),
    ...(keywords !== undefined && { keywords }),
    ...(options?.canonicalUrl && {
      alternates: await buildAlternates(options.canonicalUrl),
    }),
    openGraph: {
      title: ogTitle,
      ...(ogDescription !== undefined && { description: ogDescription }),
      images: resolveOpenGraphImages(siteName, image, ogTitle),
      type: ogType,
      locale: "ja_JP",
      siteName,
      ...(options?.canonicalUrl && { url: options.canonicalUrl }),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      ...(ogDescription !== undefined && { description: ogDescription }),
      images: resolveTwitterImages(siteName, image),
    },
  };
}
