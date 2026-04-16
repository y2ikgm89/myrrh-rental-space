import type { ReactElement } from "react";
import type { Metadata } from "next";
import { ArticleJsonLd } from "@/public/components/seo/json-ld";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { ImageFrame } from "@/public/components/design-system/image-frame";
import { Prose } from "@/public/components/design-system/prose";
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
import { BlogLayout } from "@/public/components/layouts/blog-layout";

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
          <BlogLayout>
            <div className={contentClassName} style={contentStyle}>
              {post.thumbnailUrl ? (
                <div className="mb-8">
                  <ImageFrame
                    src={post.thumbnailUrl}
                    alt={post.title}
                    aspect="video"
                    fill
                    sizes="(min-width: 1024px) 60vw, 100vw"
                    rounded
                  />
                </div>
              ) : null}

              <div className="mb-8 flex flex-wrap items-center gap-3 text-muted-foreground">
                {post.category?.name ? (
                  <span className="text-[0.7rem] uppercase tracking-[0.18em] text-accent">
                    {post.category.name}
                  </span>
                ) : null}
                {post.category?.name &&
                (post.publishedAt || post.author?.name) ? (
                  <span aria-hidden="true" className="text-border">
                    ·
                  </span>
                ) : null}
                <time
                  dateTime={
                    post.publishedAt ? String(post.publishedAt) : undefined
                  }
                  className="font-heading text-sm font-light"
                >
                  {formatSerializedDate(toISOString(post.publishedAt))}
                </time>
                {post.author?.name ? (
                  <>
                    <span aria-hidden="true" className="text-border">
                      ·
                    </span>
                    <span className="text-sm">{post.author.name}</span>
                  </>
                ) : null}
              </div>

              <Prose variant="editorial" className="max-w-none">
                <SanitizedHtml html={post.contentHtml} />
              </Prose>

              {post.postTags.length > 0 ? (
                <div className="mt-12 border-t border-border pt-6">
                  <div className="flex flex-wrap gap-2">
                    {post.postTags.map((postTag) => (
                      <span
                        key={postTag.tag.slug}
                        className="border border-border px-3 py-1 text-xs text-muted-foreground"
                      >
                        {postTag.tag.name}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              <div className="mt-12 border-t border-border pt-6">
                <ShareButtons
                  url={`${baseUrl}${post.url}`}
                  title={post.title}
                />
              </div>
            </div>
          </BlogLayout>
        </Container>
      </article>

      <SiteCTA />
    </>
  );
}
