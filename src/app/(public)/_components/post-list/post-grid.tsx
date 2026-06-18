"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { formatSerializedDate } from "@/shared/lib/serialize";
import { toAppRoute } from "@/shared/lib/typed-routes";

export interface PostCardData {
  id: string;
  slug: string;
  url: string;
  title: string;
  excerpt: string;
  thumbnailUrl: string;
  publishedAt: string | null;
  category: {
    name: string;
    slug: string;
  };
}

interface PostGridProps {
  posts: readonly PostCardData[];
  hasFilters: boolean;
}

export function PostGrid({ posts, hasFilters }: PostGridProps): ReactElement {
  if (posts.length === 0) {
    return (
      <div
        className="space-y-6 py-[var(--spacing-fluid-lg)] text-center"
        role="status"
      >
        <p className="text-muted-foreground">
          {hasFilters
            ? "条件に一致する記事が見つかりませんでした"
            : "記事がまだありません。"}
        </p>
        {hasFilters && (
          <Button variant="editorial" size="sm" href="/blog">
            フィルタを解除
          </Button>
        )}
      </div>
    );
  }

  return (
    <div className="@container">
      <ScrollRevealGroup className="grid gap-6 @sm:grid-cols-2 @3xl:grid-cols-3 @sm:gap-8">
        {posts.map((post) => (
          <Link
            key={post.id}
            href={toAppRoute(post.url)}
            className="group block overflow-hidden border border-border transition-colors duration-200"
          >
            <div className="relative aspect-[4/3] overflow-hidden">
              <Image
                src={post.thumbnailUrl}
                alt={post.title}
                fill
                sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                className="object-cover transition-transform duration-500 group-hover:scale-105"
              />
            </div>

            <div className="p-5">
              <SectionLabel>{post.category.name}</SectionLabel>

              <Heading
                level={2}
                className="mt-3 !text-lg font-bold line-clamp-2"
              >
                {post.title}
              </Heading>

              <p className="mt-2 text-sm leading-relaxed text-muted-foreground line-clamp-2">
                {post.excerpt}
              </p>

              <div className="mt-4 border-t border-border pt-3">
                <time
                  dateTime={
                    post.publishedAt ? String(post.publishedAt) : undefined
                  }
                  className="text-xs text-muted-foreground"
                >
                  {formatSerializedDate(post.publishedAt)}
                </time>
              </div>
            </div>
          </Link>
        ))}
      </ScrollRevealGroup>
    </div>
  );
}
