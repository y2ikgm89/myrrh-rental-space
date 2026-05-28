import Link from "next/link";
import type { ReactElement } from "react";

import { Container } from "@/public/components/design-system/container";
import { Section } from "@/public/components/design-system/section";
import { Heading } from "@/public/components/design-system/heading";
import { Stack } from "@/public/components/design-system/stack";
import { ImageFrame } from "@/public/components/design-system/image-frame";

export type RelatedPostCardData = {
  readonly id: string;
  readonly title: string;
  readonly slug: string;
  readonly excerpt: string;
  readonly thumbnailUrl: string;
  readonly publishedAt: Date | string | null;
  readonly category: {
    readonly id: string;
    readonly name: string;
    readonly slug: string;
  };
};

interface RelatedPostsProps {
  readonly posts: readonly RelatedPostCardData[];
}

/**
 * 関連記事セクション (公開イベント詳細ページ末尾・SiteCTA 前)。
 *
 * 管理画面で curated された Post を 3 列 editorial card grid で表示。
 * Kinfolk / Cereal Magazine 風 hairline divider + Bronze accent + serif heading 統一。
 * SEO 内部リンク強化 + JSON-LD `mentions` 連動。
 */
export function RelatedPosts({
  posts,
}: RelatedPostsProps): ReactElement | null {
  if (posts.length === 0) return null;

  return (
    <Section border="top" aria-labelledby="related-posts-heading">
      <Container>
        <Stack gap="lg">
          <Heading level={2} accent className="text-center">
            <span id="related-posts-heading">関連する記事</span>
          </Heading>
          <ul className="grid grid-cols-1 gap-8 @container @md:grid-cols-2 @3xl:grid-cols-3">
            {posts.map((post) => (
              <li key={post.id}>
                <article className="group flex flex-col gap-3">
                  <Link
                    href={`/posts/${post.slug}`}
                    className="block focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    <ImageFrame
                      src={post.thumbnailUrl}
                      alt={post.title}
                      aspect="landscape"
                      fill
                      sizes="(min-width: 1280px) 380px, (min-width: 768px) 50vw, 100vw"
                      rounded
                      className="transition-opacity duration-300 group-hover:opacity-85"
                    />
                  </Link>
                  <div className="space-y-2 px-1">
                    <p className="text-xs uppercase tracking-[0.18em] text-accent">
                      {post.category.name}
                    </p>
                    <h3 className="text-h3 text-foreground">
                      <Link
                        href={`/posts/${post.slug}`}
                        className="transition-colors hover:text-foreground/80"
                      >
                        {post.title}
                      </Link>
                    </h3>
                    {post.excerpt.length > 0 && (
                      <p className="line-clamp-2 text-sm text-muted-foreground">
                        {post.excerpt}
                      </p>
                    )}
                  </div>
                </article>
              </li>
            ))}
          </ul>
        </Stack>
      </Container>
    </Section>
  );
}
