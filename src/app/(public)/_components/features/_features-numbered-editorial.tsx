"use client";

/**
 * FeaturesNumberedEditorial — Editorial numbered list layout
 *
 * Each feature is displayed as a large italic number + horizontal rule separated item,
 * resembling a magazine table of contents.
 *
 * GSAP stagger reveal driven by ScrollTrigger on the grid container.
 */

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import { cn } from "@/shared/lib/cn";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTextStyle,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { spansToPlainText } from "@/shared/lib/portable-text";

interface Props {
  readonly config: FeaturesConfig;
  readonly style: SectionStylePayload;
}

export function FeaturesNumberedEditorial({
  config,
  style,
}: Props): ReactElement | null {
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
  if (items.length === 0) return null;

  const hasTitle = config.title.length > 0;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {hasTitle && (
        <div className="mb-16 max-w-2xl md:mb-24">
          <ScrollReveal>
            {config.sectionLabel ? (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            ) : null}
            <div style={getTitleStyle(style)}>
              <Heading
                level={2}
                className={cn("mt-4", getTitleClasses(style), "tracking-tight")}
              >
                <PortableTextSpans spans={config.title} />
              </Heading>
            </div>
          </ScrollReveal>
        </div>
      )}

      <div ref={gridRef}>
        {items.map((feature, index) => (
          <div
            key={spansToPlainText(feature.title)}
            data-feature=""
            className="grid grid-cols-1 gap-4 border-t border-border py-10 md:grid-cols-[6rem_1fr] md:gap-12 md:py-14"
          >
            <span
              className="font-heading text-6xl font-extralight leading-none text-accent/20 md:text-7xl md:text-right"
              aria-hidden="true"
            >
              {String(index + 1).padStart(2, "0")}
            </span>
            <div className="max-w-xl">
              <h3 className="font-heading text-xl font-light tracking-tight md:text-2xl">
                <PortableTextSpans spans={feature.title} />
              </h3>
              {feature.description.length > 0 ? (
                <div
                  className="mt-3 text-sm leading-[1.9] text-muted-foreground md:text-base [&_p]:mt-0 [&_p+p]:mt-3"
                  style={getTextStyle(style)}
                >
                  <PortableText blocks={feature.description} />
                </div>
              ) : null}
            </div>
          </div>
        ))}
      </div>
    </SectionWrapper>
  );
}
