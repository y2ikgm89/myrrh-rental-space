"use client";

/**
 * TestimonialSection — Customer testimonials with grid/carousel/list layout
 *
 * Card-based testimonials with quote decoration, star rating, and author info.
 * useGSAP stagger animation for card entrance.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import { IconStar, IconStarFilled } from "@tabler/icons-react";
import { cn } from "@/shared/lib/cn";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import type { TestimonialConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import {
  blocksToPlainText,
  spansToPlainText,
} from "@/shared/lib/portable-text";

interface TestimonialSectionProps {
  readonly config: TestimonialConfig;
  readonly style: SectionStylePayload;
}

function StarRating({ rating }: { readonly rating: number }): ReactElement {
  return (
    <div className="flex gap-0.5" aria-label={`${rating}つ星`}>
      {Array.from({ length: 5 }, (_, i) =>
        i < rating ? (
          <IconStarFilled
            key={i}
            className="h-3.5 w-3.5 text-accent"
            aria-hidden="true"
          />
        ) : (
          <IconStar
            key={i}
            className="h-3.5 w-3.5 text-border"
            strokeWidth={1.5}
            aria-hidden="true"
          />
        ),
      )}
    </div>
  );
}

const LAYOUT_CLASS = {
  grid: "@container",
  list: "flex flex-col gap-6 max-w-3xl mx-auto",
  carousel:
    "flex gap-6 overflow-x-auto overscroll-x-contain snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8",
} as const;

const GRID_INNER_CLASS = "grid gap-6 @md:grid-cols-2 @3xl:grid-cols-3";

const CARD_CLASS = {
  grid: "",
  list: "",
  carousel: "min-w-[300px] snap-center md:min-w-[360px]",
} as const;

export function TestimonialSection({
  config,
  style,
}: TestimonialSectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = grid.querySelectorAll("[data-testimonial-card]");
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

  if (config.items.length === 0) return <></>;

  const hasTitle = config.title.length > 0;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {hasTitle && (
        <div className="mb-12 text-center md:mb-16">
          {config.sectionLabel && (
            <ScrollReveal>
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            </ScrollReveal>
          )}
          <div style={getTitleStyle(style)}>
            <Heading
              level={2}
              className={cn("mt-4 tracking-tight", getTitleClasses(style))}
            >
              <SplitText>
                <PortableTextSpans spans={config.title} />
              </SplitText>
            </Heading>
          </div>
        </div>
      )}

      <div ref={gridRef} className={LAYOUT_CLASS[config.displayLayout]}>
        <div
          className={
            config.displayLayout === "grid" ? GRID_INNER_CLASS : undefined
          }
        >
          {config.items.map((item, index) => {
            const variant = config.variant;
            const isFeatured =
              index === 0 && config.displayLayout !== "carousel";

            // variant-specific card styles
            const cardClasses = isFeatured
              ? "py-10 md:py-14"
              : variant === "card"
                ? "p-8 border-t-2 border-t-accent/30 border-x-0 border-b-0 transition-colors duration-200"
                : variant === "minimal"
                  ? "py-6"
                  : "py-8";

            return (
              <div
                // content 由来の安定キー（ValuePropsSection と同方針・index に依存しない）
                key={`${spansToPlainText(item.authorName)}-${blocksToPlainText(
                  item.content,
                ).slice(0, 60)}`}
                data-testimonial-card=""
                className={cn(
                  cardClasses,
                  CARD_CLASS[config.displayLayout],
                  isFeatured &&
                    config.displayLayout === "grid" &&
                    "@3xl:col-span-full",
                )}
              >
                {/* IconQuote decoration (not shown in minimal) */}
                {variant !== "minimal" && (
                  <span
                    className={cn(
                      "block font-heading leading-[0.8] text-accent/10",
                      isFeatured ? "text-[6rem] md:text-[8rem]" : "text-[4rem]",
                    )}
                    aria-hidden="true"
                  >
                    &ldquo;
                  </span>
                )}

                <div
                  className={cn(
                    variant !== "minimal" && "mt-3",
                    isFeatured
                      ? "font-heading text-xl font-light leading-[1.8] italic md:text-2xl"
                      : variant === "default"
                        ? "text-base leading-[1.9] italic"
                        : "text-sm leading-relaxed",
                    "text-foreground [&_p]:mt-0 [&_p+p]:mt-3",
                  )}
                  style={getTextStyle(style)}
                >
                  {variant === "minimal" && (
                    <span
                      className="mr-1 font-serif text-lg text-accent/30"
                      aria-hidden="true"
                    >
                      &ldquo;
                    </span>
                  )}
                  <PortableText blocks={item.content} />
                  {variant === "minimal" && (
                    <span
                      className="ml-1 font-serif text-lg text-accent/30"
                      aria-hidden="true"
                    >
                      &rdquo;
                    </span>
                  )}
                </div>

                {config.showRating && item.rating != null && (
                  <div className="mt-4">
                    <StarRating rating={item.rating} />
                  </div>
                )}

                {/* Author */}
                <div
                  className={cn(
                    "mt-6 flex items-center gap-3",
                    variant === "card"
                      ? "border-t border-border pt-4"
                      : variant !== "default" &&
                          "border-t border-border/50 pt-4",
                  )}
                >
                  {item.authorImage.url && (
                    <Image
                      src={item.authorImage.url}
                      alt={
                        item.authorImage.alt ||
                        spansToPlainText(item.authorName)
                      }
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium">
                      <PortableTextSpans spans={item.authorName} />
                    </p>
                    {item.authorTitle.length > 0 && (
                      <p className="text-xs text-muted-foreground">
                        <PortableTextSpans spans={item.authorTitle} />
                      </p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </SectionWrapper>
  );
}
