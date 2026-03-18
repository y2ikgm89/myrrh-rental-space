"use client";

import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { formatSerializedDate } from "@/shared/lib/serialize";

interface PostCardData {
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
}

export function PostGrid({ posts }: PostGridProps): ReactElement {
  if (posts.length === 0) {
    return (
      <div className="py-24 text-center">
        <p className="text-muted-foreground">記事がまだありません。</p>
      </div>
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 md:gap-8">
      {posts.map((post, index) => (
        <ScrollReveal key={post.id} delay={0.1 * Math.min(index, 5)}>
          <Link
            href={post.url}
            className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow hover:shadow-lg"
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

              <h2 className="mt-3 font-heading text-lg font-bold tracking-tight line-clamp-2">
                {post.title}
              </h2>

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
        </ScrollReveal>
      ))}
    </div>
  );
}
