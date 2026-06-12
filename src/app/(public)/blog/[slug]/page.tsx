import type { Metadata } from "next";
import type { ReactElement } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import type { SearchParams } from "nuqs/server";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { ArticleTableOfContents } from "@/public/components/article/article-table-of-contents";
import { Prose } from "@/public/components/design-system/prose";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { resolveInternalLinkCards } from "@/shared/lib/lexical/resolve-internal-link-cards";
import { ArticleFooter } from "@/public/components/ui/article-footer";
import { ArticleTagList } from "@/public/components/ui/article-tag-list";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
} from "@/public/components/seo/json-ld";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { formatSerializedDate, toISOString } from "@/shared/lib/serialize";
import { extractHeadingsFromHtml } from "@/shared/lib/html/extract-headings";

const TOC_MIN_H2 = 2;

type PageProps = {
  params: Promise<{ slug: string }>;
  searchParams: Promise<SearchParams>;
};

export async function generateMetadata({
  params,
}: PageProps): Promise<Metadata> {
  await connection();
  const { slug } = await params;
  const [post, settings] = await Promise.all([
    getPublishedPost(slug),
    getSeoSettings(),
  ]);
  if (!post) return { title: "記事が見つかりません" };
  const options: { canonicalUrl: string; siteName?: string } = {
    canonicalUrl: `${getBaseUrl()}/blog/${slug}`,
  };
  if (settings?.siteName) options.siteName = settings.siteName;
  return generateArticleMetadata(
    {
      title: post.title,
      description: post.metaDescription ?? post.excerpt,
      image: post.ogpImageUrl ?? post.thumbnailUrl,
      ogpTitle: post.ogpTitle,
      ogpDescription: post.ogpDescription,
      metaKeywords: post.metaKeywords,
    },
    options,
  );
}

export default async function BlogPostPage({
  params,
}: PageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("posts");

  const { slug } = await params;
  const post = await getPublishedPost(slug);
  if (!post) notFound();

  const sidebarSettings = await getSidebarSettings();
  const baseUrl = getBaseUrl();
  const articleUrl = `${baseUrl}${post.url}`;
  const datePublished = toISOString(post.publishedAt) ?? "";

  const headings = extractHeadingsFromHtml(post.contentHtml);
  const resolvedContentHtml = await resolveInternalLinkCards(post.contentHtml);
  const h2Count = headings.filter((h) => h.level === 2).length;
  const showToc = sidebarSettings.tocEnabled && h2Count >= TOC_MIN_H2;

  const tags = post.postTags.map((pt) => pt.tag);

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ブログ", url: `${baseUrl}/blog` },
          { name: post.title, url: articleUrl },
        ]}
      />
      <ArticleLayout
        jsonLd={
          <ArticleJsonLd
            headline={post.title}
            description={post.metaDescription ?? post.title}
            {...(post.ogpImageUrl != null ? { image: post.ogpImageUrl } : {})}
            url={articleUrl}
            datePublished={datePublished}
          />
        }
        breadcrumb={[{ label: "ブログ", href: "/blog" }, { label: post.title }]}
        {...(post.contentWidth != null && { contentWidth: post.contentWidth })}
        contentWidthCustom={post.contentWidthCustom}
        heroPosition="in-grid"
        hero={
          <ArticleHeader
            eyebrow="Blog"
            title={post.title}
            meta={
              datePublished ? (
                <time dateTime={datePublished}>
                  {formatSerializedDate(datePublished)}
                </time>
              ) : null
            }
          />
        }
        {...(showToc && {
          toc: <ArticleTableOfContents variant="sidebar" headings={headings} />,
          mobileToc: (
            <ArticleTableOfContents variant="mobile" headings={headings} />
          ),
        })}
      >
        <Prose variant="editorial" className="max-w-none">
          <SanitizedHtml html={resolvedContentHtml} />
        </Prose>
        {tags.length > 0 && <ArticleTagList tags={tags} />}
        <ArticleFooter url={articleUrl} title={post.title} />
      </ArticleLayout>
    </>
  );
}
