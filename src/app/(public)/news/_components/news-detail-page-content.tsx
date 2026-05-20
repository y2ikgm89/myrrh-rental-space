import type { ReactElement, ReactNode } from "react";
import type { Metadata } from "next";
import { NewsArticleJsonLd } from "@/public/components/seo/json-ld";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { ArticleTableOfContents } from "@/public/components/article/article-table-of-contents";
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
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { toISOString } from "@/shared/lib/serialize";
import { extractHeadingsFromHtml } from "@/shared/lib/html/extract-headings";

/** 目次を表示するための最低 h2 数。これ未満なら TOC を非表示にする。 */
const TOC_MIN_H2 = 2;

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
  banner,
}: {
  newsItem: PublishedNewsItem;
  banner?: ReactNode;
}): Promise<ReactElement> {
  const [layoutConfig, sidebarSettings] = await Promise.all([
    getNewsLayoutSettings(newsItem.id),
    getSidebarSettings(),
  ]);
  const baseUrl = getBaseUrl();
  const articleUrl = `${baseUrl}${newsItem.url}`;
  const datePublished = toISOString(newsItem.publishedAt) ?? "";

  const headings = extractHeadingsFromHtml(newsItem.contentHtml);
  const h2Count = headings.filter((h) => h.level === 2).length;
  const showToc = sidebarSettings.tocEnabled && h2Count >= TOC_MIN_H2;

  return (
    <ArticleLayout
      {...(banner !== undefined && { banner })}
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
      {...(showToc && {
        toc: <ArticleTableOfContents variant="sidebar" headings={headings} />,
        mobileToc: (
          <ArticleTableOfContents variant="mobile" headings={headings} />
        ),
      })}
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
