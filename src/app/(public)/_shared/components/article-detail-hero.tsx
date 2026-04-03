"use client";

/**
 * ArticleDetailHero — 記事詳細ページ共通ヒーロー
 *
 * ブログ記事（/posts/[slug]）とニュース（/news/[slug]）で共用。
 * SplitText + ScrollReveal パターンでアニメーション。
 */

import type { ReactElement } from "react";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { formatSerializedDate } from "@/shared/lib/serialize";

interface ArticleDetailHeroProps {
  title: string;
  publishedAt: string | null;
  categoryName?: string | null;
  authorName?: string | null;
}

export function ArticleDetailHero({
  title,
  publishedAt,
  categoryName,
  authorName,
}: ArticleDetailHeroProps): ReactElement {
  return (
    <section
      data-hero=""
      className="relative flex min-h-[320px] items-end overflow-hidden pb-10 pt-[var(--header-height)] md:min-h-[380px] md:pb-16"
    >
      <div
        className="absolute inset-0 bg-gradient-to-b from-surface via-background to-background"
        aria-hidden="true"
      />

      <div className="relative mx-auto w-full max-w-6xl px-5 md:px-8">
        {categoryName && <SectionLabel>{categoryName}</SectionLabel>}

        <h1
          className={`${categoryName ? "mt-4 " : ""}font-heading text-2xl font-light tracking-tight md:text-3xl lg:text-4xl`}
        >
          <SplitText trigger={false} delay={0.3}>
            {title}
          </SplitText>
        </h1>

        <ScrollReveal delay={0.5}>
          <div className="mt-4 flex items-center gap-3 text-sm text-muted-foreground">
            <time dateTime={publishedAt ?? undefined}>
              {formatSerializedDate(publishedAt)}
            </time>
            {authorName && (
              <>
                <span aria-hidden="true">/</span>
                <span>{authorName}</span>
              </>
            )}
          </div>
        </ScrollReveal>
      </div>
    </section>
  );
}
