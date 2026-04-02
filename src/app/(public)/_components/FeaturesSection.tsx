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
import {
  IconClock,
  IconShieldCheck,
  IconSparkles,
  IconStar,
  IconWifi,
  IconParking,
  IconAirConditioning,
  IconToolsKitchen2,
} from "@tabler/icons-react";
import type { TablerIcon } from "@tabler/icons-react";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

const ICON_MAP: Record<string, TablerIcon> = {
  clock: IconClock,
  shield: IconShieldCheck,
  sparkles: IconSparkles,
  star: IconStar,
  wifi: IconWifi,
  parking: IconParking,
  aircon: IconAirConditioning,
  kitchen: IconToolsKitchen2,
};

function FeatureIndicator({
  icon,
  index,
}: {
  readonly icon: string | undefined;
  readonly index: number;
}): ReactElement {
  const IconComponent = icon ? ICON_MAP[icon] : undefined;

  if (IconComponent) {
    return (
      <IconComponent
        className="h-6 w-6 text-accent/40"
        strokeWidth={1.2}
        aria-hidden="true"
      />
    );
  }

  return (
    <span
      className="font-heading text-5xl font-light leading-none text-accent/15 md:text-6xl"
      aria-hidden="true"
    >
      {String(index + 1).padStart(2, "0")}
    </span>
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
              className="grid gap-5 border-b border-border pb-8 @md:grid-cols-[auto_1fr] @md:items-start @md:gap-8 @md:pb-12"
            >
              <div className="flex h-12 w-12 items-center justify-center">
                <FeatureIndicator icon={heroFeature.icon} index={0} />
              </div>
              <div>
                <h3 className="font-heading text-xl tracking-tight md:text-2xl">
                  {heroFeature.title}
                </h3>
                <p
                  className="mt-3 max-w-lg text-sm leading-[1.9] text-muted-foreground md:text-base"
                  style={getTextStyle(design)}
                >
                  {heroFeature.description}
                </p>
              </div>
            </div>

            {/* Remaining features — 2 columns */}
            {restFeatures.length > 0 && (
              <div className="grid gap-8 @md:mt-12 @md:grid-cols-2 @md:gap-x-16 @md:gap-y-10">
                {restFeatures.map((feature, restIndex) => (
                  <div
                    key={feature.title}
                    data-feature=""
                    className="flex items-start gap-4"
                  >
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                      <FeatureIndicator
                        icon={feature.icon}
                        index={restIndex + 1}
                      />
                    </div>
                    <div>
                      <h3 className="font-heading text-lg tracking-tight">
                        {feature.title}
                      </h3>
                      <p
                        className="mt-2 text-sm leading-[1.9] text-muted-foreground"
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
          <div
            className={`grid gap-10 @md:gap-x-16 ${getGridColsClass(config.columns)}`}
          >
            {items.map((feature, index) => (
              <div
                key={feature.title}
                data-feature=""
                className={`flex flex-col items-start gap-3${index % 2 === 1 ? " @md:mt-12" : ""}`}
              >
                <FeatureIndicator icon={feature.icon} index={index} />
                <h3 className="font-heading text-lg tracking-tight">
                  {feature.title}
                </h3>
                <p
                  className="text-sm leading-[1.9] text-muted-foreground"
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
            {items.map((feature, index) => (
              <div
                key={feature.title}
                data-feature=""
                className="flex items-start gap-4"
              >
                <div className="flex h-8 w-8 shrink-0 items-center justify-center">
                  <FeatureIndicator icon={feature.icon} index={index} />
                </div>
                <div>
                  <h3 className="font-heading text-lg tracking-tight">
                    {feature.title}
                  </h3>
                  <p
                    className="mt-2 text-sm leading-[1.9] text-muted-foreground"
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
