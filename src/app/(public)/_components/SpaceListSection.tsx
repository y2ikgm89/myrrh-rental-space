"use client";
import { useFormatPrice } from "@/public/hooks/use-format-price";

/**
 * SpaceListSection — Space listing with grid/list/carousel layout
 *
 * Configurable columns, layout variant, and "view all" link.
 * useGSAP stagger for card entrance animation.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
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
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import {
  IMAGE_ASPECT_MAP,
  getCardGridColsClass,
} from "@/public/lib/section-style-maps";
import { parseSpaceImageAspect } from "@/shared/lib/validations/section-parsers";
import type { SpaceListConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

export interface SpaceListData {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly hourlyPrice: number | null;
  readonly area: number | null;
  readonly mainImageUrl: string;
}

interface SpaceListSectionProps {
  readonly config: SpaceListConfig;
  readonly spaces: readonly SpaceListData[];
  readonly design: SectionDesign;
}

export function SpaceListSection({
  config,
  spaces,
  design,
}: SpaceListSectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);
  const { formatUnit } = useFormatPrice();

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = grid.querySelectorAll("[data-space-list-card]");
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

  const colKey = Math.min(Math.max(config.columns, 1), 4);
  const isCarousel = config.layout === "carousel";
  const isList = config.layout === "list";

  const layoutClass = isCarousel
    ? "flex gap-6 overflow-x-auto snap-x snap-mandatory scroll-smooth pb-4 -mx-5 px-5 md:-mx-8 md:px-8"
    : isList
      ? "flex flex-col gap-4"
      : `grid gap-6 ${getCardGridColsClass(colKey)}`;

  return (
    <SectionWrapper design={design}>
      <div className="mb-12 text-center md:mb-16">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>
        <div className="mt-4" style={getTitleStyle(design)}>
          <Heading
            level={2}
            className={`${getTitleClasses(design)} tracking-tight`}
          >
            <SplitText>{config.title}</SplitText>
          </Heading>
        </div>
      </div>

      <div ref={gridRef} className={layoutClass}>
        {spaces.map((space) => (
          <Link
            key={space.id}
            href={`/spaces/${space.slug}`}
            data-space-list-card=""
            className={`group overflow-hidden border border-border transition-colors duration-200 ${
              isCarousel ? "min-w-[280px] snap-center md:min-w-[320px]" : ""
            } ${isList ? "flex" : ""}`}
          >
            <div
              className={`overflow-hidden ${isList ? "w-1/3 min-w-[120px]" : IMAGE_ASPECT_MAP[parseSpaceImageAspect(config.imageAspect)]}`}
            >
              <Image
                src={space.mainImageUrl}
                alt={space.name}
                width={400}
                height={300}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                sizes={
                  isList
                    ? "33vw"
                    : `(max-width: 768px) 100vw, ${Math.round(100 / colKey)}vw`
                }
              />
            </div>
            <div className={`p-4 md:p-5 ${isList ? "flex-1" : ""}`}>
              <h3 className="font-heading text-base font-light tracking-tight md:text-lg">
                {space.name}
              </h3>
              {space.description && (
                <p
                  className="mt-1 line-clamp-2 text-sm text-muted-foreground"
                  style={getTextStyle(design)}
                >
                  {space.description}
                </p>
              )}
              {(space.capacity != null || space.hourlyPrice != null) && (
                <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
                  <span className="text-xs text-muted-foreground">
                    {space.capacity != null && `${space.capacity}名`}
                    {space.capacity != null && space.area != null && " / "}
                    {space.area != null && <>{space.area}m&sup2;</>}
                  </span>
                  {space.hourlyPrice != null && (
                    <span className="text-sm font-medium text-accent">
                      {formatUnit(space.hourlyPrice, "/h")}
                    </span>
                  )}
                </div>
              )}
            </div>
          </Link>
        ))}
      </div>

      {config.showViewAllLink && (
        <ScrollReveal delay={0.2}>
          <div className="mt-10 text-center">
            <Link
              href={config.viewAllUrl}
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
