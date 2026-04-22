"use client";

/**
 * FeaturesSection — Editorial numbered list layout
 *
 * Each feature is displayed as a large number + horizontal rule separated item,
 * resembling a magazine table of contents.
 *
 * ScrollReveal stagger for sequential reveal.
 */

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import { cn } from "@/shared/lib/cn";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

interface FeaturesSectionProps {
  readonly config: FeaturesConfig;
  readonly style: SectionStylePayload;
}

export function FeaturesSection({
  config,
  style,
}: FeaturesSectionProps): ReactElement {
  const gridRef = useRef<HTMLDivElement>(null);

  useGSAP(
    () => {
      const grid = gridRef.current;
      if (!grid) return;

      const mm = gsap.matchMedia();
      mm.add("(prefers-reduced-motion: no-preference)", () => {
        const items = grid.querySelectorAll("[data-feature]");
        if (items.length === 0) return;

        gsap.fromTo(
          items,
          { y: REVEAL.fadeUp.y, opacity: REVEAL.fadeUp.opacity },
          {
            y: 0,
            opacity: 1,
            duration: DURATION.slow,
            ease: EASE.outQuart,
            stagger: STAGGER.element + 0.05,
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

  const items = config.items;
  if (items.length === 0) return <></>;

  return (
    <SectionWrapper style={style}>
      {/* Section heading */}
      <div className="mb-16 max-w-2xl md:mb-24">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
          <div style={getTitleStyle(style)}>
            <Heading
              level={2}
              className={cn("mt-4", getTitleClasses(style), "tracking-tight")}
            >
              {config.title}
            </Heading>
          </div>
        </ScrollReveal>
      </div>

      {/* Feature list — editorial numbered items */}
      <div ref={gridRef}>
        {items.map((feature, index) => (
          <div
            key={feature.title}
            data-feature=""
            className="grid grid-cols-1 gap-4 border-t border-border py-10 md:grid-cols-[6rem_1fr] md:gap-12 md:py-14"
          >
            {/* Large number */}
            <span
              className="font-heading text-6xl font-extralight leading-none text-accent/20 md:text-7xl md:text-right"
              aria-hidden="true"
            >
              {String(index + 1).padStart(2, "0")}
            </span>

            {/* Content */}
            <div className="max-w-xl">
              <h3 className="font-heading text-xl font-light tracking-tight md:text-2xl">
                {feature.title}
              </h3>
              {feature.description && (
                <p
                  className="mt-3 text-sm leading-[1.9] text-muted-foreground md:text-base"
                  style={getTextStyle(style)}
                >
                  {feature.description}
                </p>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
