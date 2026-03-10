"use client";

/**
 * SpaceShowcase — Space card grid with stagger reveal
 *
 * Cards with hover scale animation. ScrollReveal stagger for sequential entrance.
 */

import { useRef, type ReactElement } from "react";
import Image from "next/image";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { DURATION, EASE, STAGGER } from "@/public/lib/animations";
import {
  CARD_STYLE_MAP,
  IMAGE_ASPECT_MAP,
  getGridColsClass,
} from "@/public/lib/section-style-maps";
import {
  parseCardStyle,
  parseShowcaseImageAspect,
} from "@/shared/lib/validations/section";
import type { SpaceShowcaseConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

export interface SpaceData {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly tagline: string | null;
  readonly capacity: number | null;
  readonly hourlyPrice: number | null;
  readonly area: number | null;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly slug: string;
}

interface SpaceShowcaseProps {
  readonly config: SpaceShowcaseConfig;
  readonly spaces: readonly SpaceData[];
  readonly design: SectionDesign;
}

export function SpaceShowcase({
  config,
  spaces,
  design,
}: SpaceShowcaseProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const cards = grid.querySelectorAll("[data-space-card]");
        if (cards.length === 0) return;

        gsap.fromTo(
          cards,
          { y: 50, opacity: 0 },
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

  return (
    <SectionWrapper design={design}>
      <div className="mb-12 text-center md:mb-16">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
          <h2
            className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
            style={getTitleStyle(design)}
          >
            {config.title}
          </h2>
        </ScrollReveal>
      </div>

      <div
        ref={gridRef}
        className={`grid gap-6 ${getGridColsClass(config.columns)} md:gap-8`}
      >
        {spaces.map((space) => (
          <div
            key={space.id}
            data-space-card=""
            className={`group overflow-hidden ${CARD_STYLE_MAP[parseCardStyle(config.cardStyle)]} transition-shadow duration-300 hover:shadow-lg`}
          >
            <div
              className={`${IMAGE_ASPECT_MAP[parseShowcaseImageAspect(config.imageAspect)]} overflow-hidden`}
            >
              <Image
                src={space.imageUrl}
                alt={space.imageAlt}
                width={400}
                height={300}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                sizes={`(max-width: 768px) 100vw, ${Math.round(100 / config.columns)}vw`}
              />
            </div>
            <div className="p-5 md:p-6">
              <p className="text-[11px] uppercase tracking-[0.15em] text-primary-dark">
                {space.name}
              </p>
              <h3 className="mt-1 font-heading text-lg tracking-tight">
                {space.nameJa}
              </h3>
              {space.tagline && (
                <p
                  className="mt-2 text-sm text-muted-foreground"
                  style={getTextStyle(design)}
                >
                  {space.tagline}
                </p>
              )}
              {(space.capacity != null || space.hourlyPrice != null) && (
                <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                  <span className="text-xs text-muted-foreground">
                    {space.capacity != null && `${space.capacity}名`}
                    {space.capacity != null && space.area != null && " / "}
                    {space.area != null && <>{space.area}m&sup2;</>}
                  </span>
                  {space.hourlyPrice != null && (
                    <span className="text-sm font-medium text-primary-dark">
                      &yen;{space.hourlyPrice.toLocaleString()}/h
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
