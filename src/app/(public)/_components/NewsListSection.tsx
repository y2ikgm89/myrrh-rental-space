"use client";

/**
 * NewsListSection — News article listing with list/card layout
 *
 * IconList layout: date badge + title row. Card layout: 2-column card grid.
 * useGSAP stagger for entrance animation.
 */

import { useRef, type ReactElement } from "react";
import Link from "next/link";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
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
import { cn } from "@/shared/lib/cn";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";
import { getGridColsClass } from "@/public/lib/section-style-maps";
import type { NewsListConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { toAppRoute } from "@/shared/lib/typed-routes";

export interface NewsData {
  readonly id: string;
  readonly slug: string;
  readonly url: string;
  readonly title: string;
  readonly publishedAt: string | null;
}

interface NewsListSectionProps {
  readonly config: NewsListConfig;
  readonly news: readonly NewsData[];
  readonly style: SectionStylePayload;
}

function formatDate(date: string | null): string {
  if (!date) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(new Date(date))
    .replaceAll("/", ".");
}

export function NewsListSection({
  config,
  news,
  style,
}: NewsListSectionProps): ReactElement {
  const listRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const list = listRef.current;
      if (!list) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = list.querySelectorAll("[data-news-item]");
        if (items.length === 0) return;

        gsap.fromTo(
          items,
          { y: 30, opacity: 0 },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.element,
            scrollTrigger: {
              trigger: list,
              start: "top 80%",
              toggleActions: "play none none none",
            },
          },
        );
      });
    },
    { scope: listRef },
  );

  if (news.length === 0) return <></>;

  const isCard = config.displayLayout === "card";

  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className="mb-10 text-center md:mb-14">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>
        <div className="mt-4" style={getTitleStyle(style)}>
          <Heading
            level={2}
            className={cn(getTitleClasses(style), "tracking-tight")}
          >
            <SplitText>{config.title}</SplitText>
          </Heading>
        </div>
      </div>

      <div
        ref={listRef}
        className={
          isCard
            ? cn("@container grid gap-6", getGridColsClass(config.columns))
            : "divide-y divide-border"
        }
      >
        {news.map((item) =>
          isCard ? (
            <Link
              key={item.id}
              href={toAppRoute(item.url)}
              data-news-item=""
              className="group border border-border p-5 transition-colors duration-200"
            >
              <time
                className="text-eyebrow uppercase text-muted-foreground"
                style={getTextStyle(style)}
              >
                {formatDate(item.publishedAt)}
              </time>
              <h3 className="mt-2 font-heading text-base font-light tracking-tight transition-colors group-hover:text-foreground md:text-lg">
                {item.title}
              </h3>
            </Link>
          ) : (
            <Link
              key={item.id}
              href={toAppRoute(item.url)}
              data-news-item=""
              className="group flex items-baseline gap-4 py-4 transition-colors first:pt-0 last:pb-0"
            >
              <time
                className="shrink-0 text-eyebrow tabular-nums uppercase text-muted-foreground"
                style={getTextStyle(style)}
              >
                {formatDate(item.publishedAt)}
              </time>
              <h3 className="text-sm transition-colors duration-200 group-hover:text-foreground md:text-base">
                {item.title}
              </h3>
            </Link>
          ),
        )}
      </div>

      {config.showViewAllLink && (
        <ScrollReveal delay={0.2}>
          <div className="mt-8 text-center">
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
