import type { ReactElement } from "react";
import type { Metadata } from "next";
import { ArticleJsonLd } from "@/public/components/seo/json-ld";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Badge } from "@/public/components/design-system/badge";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { ShareButtons } from "@/public/components/ui/share-buttons";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { getPostLayoutSettings } from "@/shared/domain/settings/queries/site";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { toISOString, formatSerializedDate } from "@/shared/lib/serialize";

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
  const layoutConfig = await getPostLayoutSettings(post.id);
  const { className: contentClassName, style: contentStyle } =
    resolveWidthStyles({
      width: layoutConfig.contentWidth,
      customPx: layoutConfig.contentWidthCustom,
    });

  const baseUrl = getBaseUrl();
  const datePublished = toISOString(post.publishedAt) ?? "";

  return (
    <>
      <ArticleJsonLd
        headline={post.title}
        description={post.metaDescription ?? post.excerpt}
        image={post.thumbnailUrl}
        url={`${baseUrl}${post.url}`}
        datePublished={datePublished}
        {...(post.author ? { author: { name: post.author.name } } : {})}
      />

      <PageHero
        variant="compact"
        title={post.title}
        breadcrumb={
          <Breadcrumb
            items={[{ label: "ブログ", href: "/posts" }, { label: post.title }]}
          />
        }
      />

      <article className="py-[var(--spacing-section)]">
        <Container>
          <div className={contentClassName} style={contentStyle}>
            <div className="mb-6 flex flex-wrap items-center gap-3 text-sm text-muted-foreground">
              {post.category?.name ? <Badge>{post.category.name}</Badge> : null}
              <time
                dateTime={
                  post.publishedAt ? String(post.publishedAt) : undefined
                }
              >
                {formatSerializedDate(toISOString(post.publishedAt))}
              </time>
              {post.author?.name ? (
                <>
                  <span aria-hidden="true">/</span>
                  <span>{post.author.name}</span>
                </>
              ) : null}
            </div>

            <SanitizedHtml
              html={post.contentHtml}
              className="prose prose-lg max-w-none"
            />

            {post.postTags.length > 0 ? (
              <div className="mt-12 border-t border-border pt-6">
                <div className="flex flex-wrap gap-2">
                  {post.postTags.map((postTag) => (
                    <span
                      key={postTag.tag.slug}
                      className="rounded-full border border-border px-3 py-1 text-xs text-muted-foreground"
                    >
                      {postTag.tag.name}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-12 border-t border-border pt-6">
              <ShareButtons url={`${baseUrl}${post.url}`} title={post.title} />
            </div>
          </div>
        </Container>
      </article>

      <SiteCTA />
    </>
  );
}
