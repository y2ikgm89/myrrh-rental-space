import type { ReactElement } from "react";
import type { Metadata } from "next";
import {
  BreadcrumbJsonLd,
  NewsArticleJsonLd,
} from "@/public/components/seo/JsonLd";
import { ArticleDetailHero } from "@/public/components/ArticleDetailHero";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedNewsItem } from "@/shared/domain/news/queries";
import { getNewsLayoutSettings } from "@/shared/domain/settings/queries";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { toISOString } from "@/shared/lib/serialize";

type PublishedNewsItem = NonNullable<
  Awaited<ReturnType<typeof getPublishedNewsItem>>
>;

export async function buildNewsMetadata(slug: string): Promise<Metadata> {
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
      canonicalUrl: `${getBaseUrl()}${newsItem.url}`,
      siteName: settings?.siteName ?? undefined,
    },
  );
}

export async function NewsDetailPageContent({
  newsItem,
}: {
  newsItem: PublishedNewsItem;
}): Promise<ReactElement> {
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
          { name: newsItem.title, url: newsItem.url },
        ]}
      />

      <NewsArticleJsonLd
        headline={newsItem.title}
        description={newsItem.metaDescription ?? newsItem.title}
        image={newsItem.ogpImageUrl ?? undefined}
        url={`${baseUrl}${newsItem.url}`}
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
