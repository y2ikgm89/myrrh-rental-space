"use client";

/**
 * FeaturesSection — Multiple layout modes for feature items
 *
 * Layouts:
 * - hero-first: first feature as horizontal hero, rest in 2-column grid
 * - equal-grid: all items in uniform grid using config.columns
 * - icon-left: all items in single-column list with icon left, text right
 *
 * ScrollReveal stagger for sequential reveal.
 */

import { useRef, type ReactElement } from "react";
import { useGSAP } from "@gsap/react";
import { gsap } from "@/public/lib/gsap-config";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { DURATION, EASE, REVEAL, STAGGER } from "@/public/lib/animations";
import { getGridColsClass } from "@/public/lib/section-style-maps";
import { parseFeaturesLayout } from "@/shared/lib/validations/section-parsers";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

function FeatureIcon({
  icon,
  size = "default",
}: {
  readonly icon: string | undefined;
  readonly size?: "hero" | "default";
}): ReactElement {
  const isHero = size === "hero";

  return (
    <div
      className={`flex items-center justify-center ${
        isHero
          ? "h-16 w-16 rounded-lg bg-accent/50"
          : "h-10 w-10 rounded-lg bg-accent/50"
      }`}
    >
      <svg
        className={`${isHero ? "h-7 w-7" : "h-4 w-4"} text-accent`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={1.5}
        aria-hidden="true"
      >
        {icon === "clock" && (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6v6h4.5m4.5 0a9 9 0 1 1-18 0 9 9 0 0 1 18 0Z"
          />
        )}
        {icon === "shield" && (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z"
          />
        )}
        {icon === "sparkles" && (
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9.813 15.904 9 18.75l-.813-2.846a4.5 4.5 0 0 0-3.09-3.09L2.25 12l2.846-.813a4.5 4.5 0 0 0 3.09-3.09L9 5.25l.813 2.846a4.5 4.5 0 0 0 3.09 3.09L15.75 12l-2.846.813a4.5 4.5 0 0 0-3.09 3.09ZM18.259 8.715 18 9.75l-.259-1.035a3.375 3.375 0 0 0-2.455-2.456L14.25 6l1.036-.259a3.375 3.375 0 0 0 2.455-2.456L18 2.25l.259 1.035a3.375 3.375 0 0 0 2.455 2.456L21.75 6l-1.036.259a3.375 3.375 0 0 0-2.455 2.456Z"
          />
        )}
      </svg>
    </div>
  );
}

interface FeaturesSectionProps {
  readonly config: FeaturesConfig;
  readonly design: SectionDesign;
}

export function FeaturesSection({
  config,
  design,
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

  const layout = parseFeaturesLayout(config.layout);

  // hero-first requires at least 1 item for the hero
  const heroFeature = items[0];
  if (layout === "hero-first" && !heroFeature) return <></>;

  const restFeatures = items.slice(1);

  return (
    <SectionWrapper design={design}>
      <div className="mb-12 md:mb-16">
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

      <div ref={gridRef} className="@container">
        {layout === "hero-first" && heroFeature && (
          <div className="space-y-8 @md:space-y-12">
            {/* Hero feature — horizontal layout on md+ */}
            <div
              data-feature=""
              className="grid gap-5 @md:grid-cols-[auto_1fr] @md:items-start @md:gap-8"
            >
              <FeatureIcon icon={heroFeature.icon} size="hero" />
              <div>
                <h3 className="font-heading text-xl tracking-tight md:text-2xl">
                  {heroFeature.title}
                </h3>
                <p
                  className="mt-3 max-w-lg text-sm leading-relaxed text-muted-foreground md:text-base"
                  style={getTextStyle(design)}
                >
                  {heroFeature.description}
                </p>
              </div>
            </div>

            {/* Remaining features — 2 columns */}
            {restFeatures.length > 0 && (
              <div className="grid gap-8 @md:grid-cols-2 @md:gap-10">
                {restFeatures.map((feature) => (
                  <div
                    key={feature.title}
                    data-feature=""
                    className="flex items-start gap-4"
                  >
                    <FeatureIcon icon={feature.icon} />
                    <div>
                      <h3 className="font-heading text-lg tracking-tight">
                        {feature.title}
                      </h3>
                      <p
                        className="mt-2 text-sm leading-relaxed text-muted-foreground"
                        style={getTextStyle(design)}
                      >
                        {feature.description}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {layout === "equal-grid" && (
          <div className={`grid gap-8 ${getGridColsClass(config.columns)}`}>
            {items.map((feature) => (
              <div
                key={feature.title}
                data-feature=""
                className="flex flex-col items-start gap-3"
              >
                <FeatureIcon icon={feature.icon} />
                <h3 className="font-heading text-lg tracking-tight">
                  {feature.title}
                </h3>
                <p
                  className="text-sm leading-relaxed text-muted-foreground"
                  style={getTextStyle(design)}
                >
                  {feature.description}
                </p>
              </div>
            ))}
          </div>
        )}

        {layout === "icon-left" && (
          <div className="flex flex-col gap-6">
            {items.map((feature) => (
              <div
                key={feature.title}
                data-feature=""
                className="flex items-start gap-4"
              >
                <FeatureIcon icon={feature.icon} />
                <div>
                  <h3 className="font-heading text-lg tracking-tight">
                    {feature.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-relaxed text-muted-foreground"
                    style={getTextStyle(design)}
                  >
                    {feature.description}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </SectionWrapper>
  );
}
