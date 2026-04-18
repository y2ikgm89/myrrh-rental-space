import type { ReactElement } from "react";
import type { Metadata } from "next";
import { ArticleJsonLd } from "@/public/components/seo/json-ld";
import { ArticleLayout } from "@/public/components/layouts/article-layout";
import { ArticleHeader } from "@/public/components/layouts/article-header";
import { ArticleTableOfContents } from "@/public/components/article/article-table-of-contents";
import { Prose } from "@/public/components/design-system/prose";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ArticleFooter } from "@/public/components/ui/article-footer";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { getPostLayoutSettings } from "@/shared/domain/settings/queries/site";
import { getSidebarSettings } from "@/shared/domain/settings/queries/sidebar";
import { toISOString } from "@/shared/lib/serialize";
import { extractHeadings } from "@/shared/lib/lexical/extract-headings";

/** 目次を表示するための最低 h2 数。これ未満なら TOC を非表示にする。 */
const TOC_MIN_H2 = 2;

type PublishedPost = NonNullable<Awaited<ReturnType<typeof getPublishedPost>>>;

export async function buildPostMetadata(slug: string): Promise<Metadata> {
  const [post, settings] = await Promise.all([
    getPublishedPost(slug),
    getSeoSettings(),
  ]);

  if (!post) {
    return { title: "記事が見つかりません" };
  }

  const options: { canonicalUrl: string; siteName?: string } = {
    canonicalUrl: `${getBaseUrl()}${post.url}`,
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

export async function PostDetailPageContent({
  post,
}: {
  post: PublishedPost;
}): Promise<ReactElement> {
  const [layoutConfig, sidebarSettings] = await Promise.all([
    getPostLayoutSettings(post.id),
    getSidebarSettings(),
  ]);
  const baseUrl = getBaseUrl();
  const articleUrl = `${baseUrl}${post.url}`;
  const datePublished = toISOString(post.publishedAt) ?? "";

  const headings = extractHeadings(post.contentJson);
  const h2Count = headings.filter((h) => h.level === 2).length;
  const showToc = sidebarSettings.tocEnabled && h2Count >= TOC_MIN_H2;

  return (
    <ArticleLayout
      jsonLd={
        <ArticleJsonLd
          headline={post.title}
          description={post.metaDescription ?? post.excerpt}
          image={post.thumbnailUrl}
          url={articleUrl}
          datePublished={datePublished}
          {...(post.author ? { author: { name: post.author.name } } : {})}
        />
      }
      breadcrumb={[{ label: "ブログ", href: "/posts" }, { label: post.title }]}
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
        title={post.title}
        publishedAt={post.publishedAt}
        category={post.category?.name ?? null}
        author={post.author?.name ?? null}
        thumbnail={
          post.thumbnailUrl ? { url: post.thumbnailUrl, alt: post.title } : null
        }
      />
      <Prose variant="editorial" className="max-w-none">
        <SanitizedHtml html={post.contentHtml} />
      </Prose>
      <ArticleFooter
        url={articleUrl}
        title={post.title}
        tags={post.postTags.map((postTag) => postTag.tag)}
      />
    </ArticleLayout>
  );
}
