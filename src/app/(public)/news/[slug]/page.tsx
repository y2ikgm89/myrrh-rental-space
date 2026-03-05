/**
 * /news/[slug] — ニュース詳細ページ
 *
 * SEO: generateArticleMetadata + NewsArticleJsonLd + BreadcrumbList JSON-LD
 * コンテンツ幅: DB設定に従う（getNewsLayoutSettings → resolveWidthStyles）
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import {
  NewsArticleJsonLd,
  BreadcrumbJsonLd,
} from "@/public/components/seo/JsonLd";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { getNewsLayoutSettings } from "@/public/lib/layout-settings";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { getBaseUrl } from "@/shared/lib/constants";
import { toISOString } from "@/shared/lib/serialize";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getPublishedNewsItem } from "@/public/actions/news";
import { ArticleDetailHero } from "@/public/components/ArticleDetailHero";
import { NewsPreviewContent } from "../_components/NewsPreviewContent";

interface PageProps {
  params: Promise<{ slug: string }>;
  searchParams: Promise<{ preview?: string }>;
}

export async function generateMetadata({
  params,
  searchParams,
}: PageProps): Promise<Metadata> {
  await connection();

  const { slug } = await params;
  const sp = await searchParams;
  if (sp.preview === "true") {
    return { title: "プレビュー", robots: { index: false, follow: false } };
  }

  const [newsItem, settings] = await Promise.all([
    getPublishedNewsItem(slug),
    getSeoSettings(),
  ]);

  if (!newsItem) {
    return { title: "お知らせが見つかりません" };
  }

  return generateArticleMetadata(
    {
      title: newsItem.title,
      description: newsItem.metaDescription,
      image: newsItem.ogpImageUrl,
      ogpTitle: newsItem.ogpTitle,
      ogpDescription: newsItem.ogpDescription,
      metaKeywords: newsItem.metaKeywords,
    },
    {
      canonicalUrl: `${getBaseUrl()}/news/${slug}`,
      siteName: settings?.siteName ?? undefined,
    },
  );
}

export default async function NewsDetailPage({
  params,
  searchParams,
}: PageProps): Promise<ReactElement> {
  await connection();

  const { slug } = await params;
  const sp = await searchParams;

  if (sp.preview === "true") {
    return <NewsPreviewContent identifier={slug} />;
  }

  const newsItem = await getPublishedNewsItem(slug);

  if (!newsItem) {
    notFound();
  }

  const layoutConfig = await getNewsLayoutSettings(newsItem.id);
  const { className: contentClassName, style: contentStyle } =
    resolveWidthStyles({
      width: layoutConfig.contentWidth,
      customPx: layoutConfig.contentWidthCustom,
    });

  const baseUrl = getBaseUrl();
  const datePublished = toISOString(newsItem.publishedAt) ?? "";

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "お知らせ", url: "/news" },
          { name: newsItem.title, url: `/news/${slug}` },
        ]}
      />

      <NewsArticleJsonLd
        headline={newsItem.title}
        description={newsItem.metaDescription ?? newsItem.title}
        image={newsItem.ogpImageUrl ?? undefined}
        url={`${baseUrl}/news/${slug}`}
        datePublished={datePublished}
      />

      <ArticleDetailHero
        title={newsItem.title}
        publishedAt={newsItem.publishedAt}
      />

      <article className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className={contentClassName} style={contentStyle}>
          <SanitizedHtml
            html={newsItem.contentHtml}
            className="prose prose-lg max-w-none"
          />
        </div>
      </article>
    </>
  );
}
