import type { ReactElement } from "react";
import type { Metadata } from "next";
import { NewsArticleJsonLd } from "@/public/components/seo/JsonLd";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ShareButtons } from "@/public/components/ui/share-buttons";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedNewsItem } from "@/shared/domain/news/queries";
import { getNewsLayoutSettings } from "@/shared/domain/settings/queries/site";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { toISOString } from "@/shared/lib/serialize";
import { formatSerializedDate } from "@/shared/lib/serialize";

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
  const { className: contentClassName, style: contentStyle } =
    resolveWidthStyles({
      width: layoutConfig.contentWidth,
      customPx: layoutConfig.contentWidthCustom,
    });

  const baseUrl = getBaseUrl();
  const datePublished = toISOString(newsItem.publishedAt) ?? "";

  return (
    <>
      <NewsArticleJsonLd
        headline={newsItem.title}
        description={newsItem.metaDescription ?? newsItem.title}
        {...(newsItem.ogpImageUrl != null
          ? { image: newsItem.ogpImageUrl }
          : {})}
        url={`${baseUrl}${newsItem.url}`}
        datePublished={datePublished}
      />

      <PageHero
        variant="compact"
        title={newsItem.title}
        breadcrumb={
          <Breadcrumb
            items={[
              { label: "お知らせ", href: "/news" },
              { label: newsItem.title },
            ]}
          />
        }
      />

      <article className="py-[var(--spacing-section)]">
        <Container>
          <div className={contentClassName} style={contentStyle}>
            <div className="mb-6 text-sm text-muted-foreground">
              <time dateTime={newsItem.publishedAt ?? undefined}>
                {formatSerializedDate(newsItem.publishedAt)}
              </time>
            </div>
            <SanitizedHtml
              html={newsItem.contentHtml}
              className="prose prose-lg max-w-none"
            />
            <div className="mt-12 border-t border-border pt-6">
              <ShareButtons
                url={`${baseUrl}${newsItem.url}`}
                title={newsItem.title}
              />
            </div>
          </div>
        </Container>
      </article>

      <SiteCTA />
    </>
  );
}
