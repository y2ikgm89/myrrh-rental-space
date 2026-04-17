import type { ReactElement } from "react";
import type { Metadata } from "next";
import { NewsArticleJsonLd } from "@/public/components/seo/json-ld";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { Prose } from "@/public/components/design-system/prose";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ArticleFooter } from "@/public/components/ui/article-footer";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedNewsItem } from "@/shared/domain/news/queries";
import { getNewsLayoutSettings } from "@/shared/domain/settings/queries/site";
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

  const options: { canonicalUrl: string; siteName?: string } = {
    canonicalUrl: `${getBaseUrl()}${newsItem.url}`,
  };
  if (settings?.siteName) options.siteName = settings.siteName;

  return generateArticleMetadata(
    {
      title: newsItem.title,
      description: newsItem.metaDescription,
      image: newsItem.ogpImageUrl,
      ogpTitle: newsItem.ogpTitle,
      ogpDescription: newsItem.ogpDescription,
      metaKeywords: newsItem.metaKeywords,
    },
    options,
  );
}

export async function NewsDetailPageContent({
  newsItem,
}: {
  newsItem: PublishedNewsItem;
}): Promise<ReactElement> {
  const layoutConfig = await getNewsLayoutSettings(newsItem.id);
  const baseUrl = getBaseUrl();
  const articleUrl = `${baseUrl}${newsItem.url}`;
  const datePublished = toISOString(newsItem.publishedAt) ?? "";

  return (
    <ArticleLayout
      jsonLd={
        <NewsArticleJsonLd
          headline={newsItem.title}
          description={newsItem.metaDescription ?? newsItem.title}
          {...(newsItem.ogpImageUrl != null
            ? { image: newsItem.ogpImageUrl }
            : {})}
          url={articleUrl}
          datePublished={datePublished}
        />
      }
      breadcrumb={[
        { label: "お知らせ", href: "/news" },
        { label: newsItem.title },
      ]}
      contentWidth={layoutConfig.contentWidth}
      contentWidthCustom={layoutConfig.contentWidthCustom}
    >
      <ArticleHeader
        title={newsItem.title}
        publishedAt={newsItem.publishedAt}
      />
      <Prose variant="editorial" className="max-w-none">
        <SanitizedHtml html={newsItem.contentHtml} />
      </Prose>
      <ArticleFooter url={articleUrl} title={newsItem.title} />
    </ArticleLayout>
  );
}
