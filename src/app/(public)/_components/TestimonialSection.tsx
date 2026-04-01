"use client";

/**
 * TestimonialSection — Customer testimonials with grid/carousel/list layout
 *
 * Card-based testimonials with quote decoration, star rating, and author info.
 * useGSAP stagger animation for card entrance.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import type { TestimonialConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

interface TestimonialSectionProps {
  readonly config: TestimonialConfig;
  readonly design: SectionDesign;
}

function StarRating({ rating }: { readonly rating: number }): ReactElement {
  return (
    <div className="flex gap-0.5" aria-label={`${rating}つ星`}>
      {Array.from({ length: 5 }, (_, i) => (
        <svg
          key={i}
          className={`h-4 w-4 ${i < rating ? "text-accent" : "text-muted"}`}
          fill="currentColor"
          viewBox="0 0 20 20"
        >
          <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
        </svg>
      ))}
    </div>
  );
}

const LAYOUT_CLASS = {
  grid: "@container",
  list: "flex flex-col gap-6 max-w-3xl mx-auto",
  carousel:
    "flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8",
} as const;

const GRID_INNER_CLASS = "grid gap-6 @md:grid-cols-2 @3xl:grid-cols-3";

const CARD_CLASS = {
  grid: "",
  list: "",
  carousel: "min-w-[300px] snap-center md:min-w-[360px]",
} as const;

export function TestimonialSection({
  config,
  design,
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

  return (
    <SectionWrapper design={design}>
      <div className="mb-12 text-center md:mb-16">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>
        <h2
          className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
          style={getTitleStyle(design)}
        >
          <SplitText variant="words">{config.title}</SplitText>
        </h2>
      </div>

      <div ref={gridRef} className={LAYOUT_CLASS[config.layout]}>
        <div
          className={config.layout === "grid" ? GRID_INNER_CLASS : undefined}
        >
          {config.items.map((item, index) => {
            const variant = config.variant;

            // variant-specific card styles
            const cardClasses =
              variant === "card"
                ? "rounded-lg bg-card p-8 border border-border border-l-4 border-l-primary hover:shadow-lg transition-shadow"
                : variant === "minimal"
                  ? "py-6"
                  : "rounded-lg border border-border bg-card p-6";

            return (
              <div
                /* eslint-disable-next-line @eslint-react/no-array-index-key */
                key={index}
                data-testimonial-card=""
                className={`${cardClasses} ${CARD_CLASS[config.layout]}`}
              >
                {/* IconQuote decoration (not shown in minimal) */}
                {variant !== "minimal" && (
                  <span
                    className="block font-serif text-4xl leading-none text-accent/20"
                    aria-hidden="true"
                  >
                    &ldquo;
                  </span>
                )}

                <p
                  className={`${variant === "minimal" ? "" : "mt-2"} text-sm leading-relaxed text-foreground`}
                  style={getTextStyle(design)}
                >
                  {variant === "minimal" && (
                    <span
                      className="mr-1 font-serif text-lg text-accent/30"
                      aria-hidden="true"
                    >
                      &ldquo;
                    </span>
                  )}
                  {item.content}
                  {variant === "minimal" && (
                    <span
                      className="ml-1 font-serif text-lg text-accent/30"
                      aria-hidden="true"
                    >
                      &rdquo;
                    </span>
                  )}
                </p>

                {config.showRating && item.rating != null && (
                  <div className="mt-4">
                    <StarRating rating={item.rating} />
                  </div>
                )}

                {/* Author */}
                <div
                  className={`mt-4 flex items-center gap-3 ${variant === "minimal" ? "border-t border-border/50" : "border-t border-border"} pt-4`}
                >
                  {item.authorImageUrl && (
                    <Image
                      src={item.authorImageUrl}
                      alt={item.authorName}
                      width={48}
                      height={48}
                      className="h-12 w-12 rounded-full object-cover"
                    />
                  )}
                  <div>
                    <p className="text-sm font-medium">{item.authorName}</p>
                    {item.authorTitle && (
                      <p className="text-xs text-muted-foreground">
                        {item.authorTitle}
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
