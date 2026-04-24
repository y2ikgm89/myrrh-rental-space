"use client";

/**
 * PostListSection — Blog post listing with grid/list layout
 *
 * Card grid with thumbnail, category badge, title, and excerpt.
 * useGSAP stagger for card entrance animation.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import {
  IMAGE_ASPECT_MAP,
  getCardGridColsClass,
} from "@/public/lib/section-style-maps";
import { parsePostImageAspect } from "@/shared/lib/validations/section-parsers";
import type { PostListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { toAppRoute } from "@/shared/lib/typed-routes";

export interface PostData {
  readonly id: string;
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly excerpt: string;
  readonly thumbnailUrl: string;
  readonly publishedAt: string | null;
  readonly categoryName: string | null;
}

interface PostListSectionProps {
  readonly config: PostListConfig;
  readonly posts: readonly PostData[];
  readonly style: SectionStylePayload;
}

export function PostListSection({
  config,
  posts,
  style,
}: PostListSectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = grid.querySelectorAll("[data-post-card]");
        if (cards.length === 0) return;

        gsap.fromTo(
          cards,
          { y: REVEAL.fadeUp.y, opacity: REVEAL.fadeUp.opacity },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.card,
            scrollTrigger: {
              trigger: grid,
              start: "top 80%",
              toggleActions: "play none none none",
            },
          },
        );
      });
    },
    { scope: gridRef },
  );

  if (posts.length === 0) return <></>;

  const isList = config.layout === "list";
  const colKey = Math.min(Math.max(config.columns, 1), 4);

  return (
    <SectionWrapper style={style}>
      <div className="mb-12 text-center md:mb-16">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>
        <div className="mt-4" style={getTitleStyle(style)}>
          <Heading
            level={2}
            className={cn("tracking-tight", getTitleClasses(style))}
          >
            <SplitText>{config.title}</SplitText>
          </Heading>
        </div>
      </div>

      <div
        ref={gridRef}
        className={
          isList
            ? "flex flex-col gap-4"
            : `@container grid gap-6 ${getCardGridColsClass(colKey)}`
        }
      >
        {posts.map((post) => (
          <Link
            key={post.id}
            href={toAppRoute(post.url)}
            data-post-card=""
            className={cn(
              "group overflow-hidden border border-border transition-colors duration-200",
              isList && "flex",
            )}
          >
            <div
              className={cn(
                "overflow-hidden",
                isList
                  ? "w-1/3 min-w-[120px]"
                  : IMAGE_ASPECT_MAP[parsePostImageAspect(config.imageAspect)],
              )}
            >
              <Image
                src={post.thumbnailUrl}
                alt={post.title}
                width={400}
                height={225}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                sizes={
                  isList
                    ? "33vw"
                    : `(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`
                }
              />
            </div>
            <div className={cn("p-4 md:p-5", isList && "flex-1")}>
              {post.categoryName && (
                <span className="text-[10px] uppercase tracking-[0.18em] text-accent">
                  {post.categoryName}
                </span>
              )}
              <h3 className="mt-1 font-heading text-base font-light tracking-tight transition-colors group-hover:text-foreground md:text-lg">
                {post.title}
              </h3>
              <p
                className="mt-2 line-clamp-2 text-sm text-muted-foreground"
                style={getTextStyle(style)}
              >
                {post.excerpt}
              </p>
            </div>
          </Link>
        ))}
      </div>

      {config.showViewAllLink && (
        <ScrollReveal delay={0.2}>
          <div className="mt-10 text-center">
            <Link
              href={toAppRoute(config.viewAllUrl)}
              className="group relative inline-block text-xs uppercase tracking-[0.18em] text-muted-foreground transition-colors hover:text-foreground"
            >
              {config.viewAllText} &rarr;
              <span className="absolute bottom-0 left-0 h-px w-0 bg-accent/60 transition-all duration-300 group-hover:w-full" />
            </Link>
          </div>
        </ScrollReveal>
      )}
    </SectionWrapper>
  );
}
