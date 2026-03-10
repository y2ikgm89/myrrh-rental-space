import type { ReactElement } from "react";
import type { Metadata } from "next";
import {
  ArticleJsonLd,
  BreadcrumbJsonLd,
} from "@/public/components/seo/JsonLd";
import { ArticleDetailHero } from "@/public/components/ArticleDetailHero";
import {
  generateArticleMetadata,
  getSeoSettings,
} from "@/public/lib/seo/metadata-factory";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { getBaseUrl } from "@/shared/lib/constants";
import { getPublishedPost } from "@/shared/domain/posts/queries";
import { getPostLayoutSettings } from "@/shared/domain/settings/queries";
import { resolveWidthStyles } from "@/shared/lib/styles/layout-mapper";
import { toISOString } from "@/shared/lib/serialize";

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
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "ブログ", url: "/posts" },
          { name: post.title, url: post.url },
        ]}
      />

      <ArticleJsonLd
        headline={post.title}
        description={post.metaDescription ?? post.excerpt}
        image={post.thumbnailUrl}
        url={`${baseUrl}${post.url}`}
        datePublished={datePublished}
        {...(post.author ? { author: { name: post.author.name } } : {})}
      />

      <ArticleDetailHero
        title={post.title}
        categoryName={post.category?.name ?? null}
        publishedAt={toISOString(post.publishedAt) ?? null}
        authorName={post.author?.name ?? null}
      />

      <article className="mx-auto max-w-6xl px-5 py-16 md:px-8 md:py-24">
        <div className={contentClassName} style={contentStyle}>
          <SanitizedHtml
            html={post.contentHtml}
            className="prose prose-lg max-w-none"
          />
        </div>

        {post.postTags.length > 0 && (
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
        )}
      </article>
    </>
  );
}
