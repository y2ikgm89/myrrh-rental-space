/**
 * ページメタデータ取得ユーティリティ
 *
 * 全ページ共通のメタデータ生成パイプライン。
 * DB（Pageテーブル）の SEO/OGP 設定を優先し、
 * 未設定フィールドは Settings フォールバック → デフォルト値の順で補完。
 *
 * Next.js 16 PPR対応:
 * - 'use cache' ディレクティブでキャッシュし、プリレンダリング時の動的データアクセスを回避
 */

import type { Metadata } from "next";
import { getBaseUrl } from "@/shared/lib/constants";
import {
  getSeoSettings,
  nonEmpty,
  resolvePageDescription,
  resolveSiteBranding,
} from "@/public/lib/seo/metadata-factory";
import {
  resolveOpenGraphImages,
  resolveTwitterImages,
} from "@/public/lib/seo/default-social-images";
import {
  FEATURE_DISABLED_PAGE_METADATA,
  createNoindexMetadata,
} from "@/public/lib/seo/feature-gated-metadata";
import { getFeatureModuleForPageSlug } from "@/shared/lib/features/registry";
import { isFeatureEnabled } from "@/shared/domain/features/check";
import {
  SYSTEM_PAGES,
  getSystemPageDefinition,
  type SystemPageDefinition,
} from "@/shared/lib/validations/page";
import {
  getPageSeo,
  isPublicPageUnpublished,
} from "@/shared/domain/pages/queries";
import { buildAlternates } from "@/public/lib/seo/feed-alternates";

/**
 * 非公開ページ用の metadata。`[...segments]/page.tsx` の 404 metadata と同一の形。
 */
const UNPUBLISHED_PAGE_METADATA: Metadata =
  createNoindexMetadata("ページが見つかりません");

/**
 * SEOデータ型
 */
export interface PageSeoData {
  title: string;
  metaDescription: string | null;
  metaKeywords: string | null;
  ogpTitle: string | null;
  ogpDescription: string | null;
  ogpImageUrl: string | null;
}

/**
 * システムページのデフォルトSEO設定を取得
 *
 * SystemPageDefinition.description は seed metadata 専用で `Page.description` 列が
 * 削除済のため metaDescription の fallback として利用する。
 */
export function getDefaultPageSeo(slug: string): PageSeoData | null {
  const definition = getSystemPageDefinition(slug);
  if (!definition) return null;

  return {
    title: definition.title,
    metaDescription: definition.description,
    metaKeywords: null,
    ogpTitle: null,
    ogpDescription: null,
    ogpImageUrl: null,
  };
}

/**
 * ページのメタデータを生成（統一パイプライン）
 *
 * 優先順位: DB PageSEO設定 > Settings フォールバック > システムページデフォルト
 *
 * 生成項目:
 * - title / description
 * - canonical URL
 * - Open Graph (url, siteName, locale, images, type)
 * - Twitter Card (summary_large_image)
 * - keywords
 */
export async function generatePageMetadata(slug: string): Promise<Metadata> {
  const featureModule = getFeatureModuleForPageSlug(slug);
  if (featureModule && !(await isFeatureEnabled(featureModule))) {
    return FEATURE_DISABLED_PAGE_METADATA;
  }

  if (await isPublicPageUnpublished(slug)) {
    return UNPUBLISHED_PAGE_METADATA;
  }

  const baseUrl = getBaseUrl();
  // Page SEO と Settings を並列取得
  const [seo, settings] = await Promise.all([
    getPageSeo(slug),
    getSeoSettings(),
  ]);
  const defaultSeo = getDefaultPageSeo(slug);

  const branding = resolveSiteBranding(settings);
  const siteName = branding.siteName;

  // タイトル: DB > デフォルト > slug
  //
  // Home title rule (clean-break):
  // - DB title 欠落、またはシステム既定「ホームページ」→ `{ absolute: siteName }`
  //   （layout template `%s | siteName` で弱い "ホームページ | {siteName}" になるのを避ける）
  // - カスタム DB title → `{ absolute: custom }`（home はブランド文書タイトルをそのまま使う）
  // - それ以外の slug → 通常の相対 title（layout template 適用）
  const SYSTEM_HOME_DEFAULT_TITLE = "ホームページ";
  const resolvedTitleString = seo?.title || defaultSeo?.title || slug;
  const isDefaultHomeTitle =
    slug === "home" &&
    (!nonEmpty(seo?.title) || seo?.title === SYSTEM_HOME_DEFAULT_TITLE);
  const title: Metadata["title"] = isDefaultHomeTitle
    ? { absolute: siteName }
    : slug === "home"
      ? { absolute: resolvedTitleString }
      : resolvedTitleString;
  const titleForOg = isDefaultHomeTitle ? siteName : resolvedTitleString;

  // 説明文: page SEO → settings → system default → SITE_DEFAULTS
  const description = resolvePageDescription(
    settings,
    seo?.metaDescription,
    defaultSeo?.metaDescription,
  );

  // OGP タイトル/説明: DB OGP > Settings OGP > 通常値
  const ogTitle =
    nonEmpty(seo?.ogpTitle) ??
    nonEmpty(settings?.defaultOgpTitle) ??
    titleForOg;
  const ogDescription =
    nonEmpty(seo?.ogpDescription) ??
    nonEmpty(settings?.defaultOgpDescription) ??
    description;

  // OGP 画像: DB > Settings デフォルト
  const ogImage = seo?.ogpImageUrl || settings?.defaultOgpImageUrl || undefined;

  // canonical URL: 'home' はルート URL、それ以外は /{slug}
  const canonicalUrl = slug === "home" ? `${baseUrl}/` : `${baseUrl}/${slug}`;

  const metadata: Metadata = {
    title,
    description,
    alternates: await buildAlternates(canonicalUrl),
    openGraph: {
      title: ogTitle,
      description: ogDescription ?? undefined,
      url: canonicalUrl,
      siteName,
      locale: "ja_JP",
      type: "website",
      images: resolveOpenGraphImages(siteName, ogImage, ogTitle),
    },
    twitter: {
      card: "summary_large_image",
      title: ogTitle,
      description: ogDescription ?? undefined,
      images: resolveTwitterImages(siteName, ogImage),
    },
  };

  // メタキーワード
  if (seo?.metaKeywords || settings?.defaultMetaKeywords) {
    const keywords = seo?.metaKeywords || settings?.defaultMetaKeywords || "";
    metadata.keywords = keywords.split(",").map((k) => k.trim());
  }

  return metadata;
}

/**
 * すべてのシステムページ定義を取得
 */
export function getAllSystemPages(): readonly SystemPageDefinition[] {
  return SYSTEM_PAGES;
}
