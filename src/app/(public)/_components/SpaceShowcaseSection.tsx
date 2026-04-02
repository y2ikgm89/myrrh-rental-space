/**
 * SpaceShowcaseSection — Space card grid (Server Component)
 *
 * Reuses SpaceCard for consistent design. Animation via ScrollReveal.
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/SectionWrapper";
import { SpaceCard } from "../spaces/_components/space-card";
import { getCardGridColsClass } from "@/public/lib/section-style-maps";
import type { SpaceShowcaseConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

export interface ShowcaseSpaceData {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly hourlyPrice: number | null;
  readonly dailyPrice: number | null;
  readonly area: number | null;
  readonly mainImageUrl: string;
  readonly facilities: readonly string[];
  readonly categoryName: string | null;
  readonly locationName: string | null;
  readonly lineAddress: string | null;
}

interface SpaceShowcaseSectionProps {
  readonly config: SpaceShowcaseConfig;
  readonly spaces: readonly ShowcaseSpaceData[];
  readonly design: SectionDesign;
}

export function SpaceShowcaseSection({
  config,
  spaces,
  design,
}: SpaceShowcaseSectionProps): ReactElement {
  const featured = spaces[0];
  const remaining = spaces.slice(1);

  return (
    <SectionWrapper design={design}>
      {/* Section heading — left aligned, editorial */}
      <div className="mb-12 flex items-end justify-between md:mb-20">
        <div>
          <ScrollReveal>
            {config.sectionLabel ? (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            ) : null}
            <h2
              className={`mt-4 font-heading ${getTitleClasses(design)} font-light tracking-tight`}
              style={getTitleStyle(design)}
            >
              {config.title}
            </h2>
          </ScrollReveal>
        </div>
        {/* Decorative line extending to right */}
        <div className="mb-3 hidden flex-1 md:block">
          <div className="ml-12 h-px bg-border" aria-hidden="true" />
        </div>
      </div>

      {/* Featured first card — large */}
      {featured && (
        <ScrollReveal>
          <div className="mb-10 md:mb-16">
            <SpaceCard
              slug={featured.slug}
              name={featured.name}
              description={featured.description}
              capacity={featured.capacity}
              area={featured.area}
              hourlyPrice={featured.hourlyPrice}
              dailyPrice={featured.dailyPrice}
              mainImageUrl={featured.mainImageUrl}
              categoryName={featured.categoryName}
              locationName={featured.locationName ?? undefined}
              lineAddress={featured.lineAddress ?? undefined}
              facilities={featured.facilities}
            />
          </div>
        </ScrollReveal>
      )}

      {/* Remaining cards — smaller grid */}
      {remaining.length > 0 && (
        <div
          className={`grid gap-6 ${getCardGridColsClass(config.columns)} md:gap-8`}
        >
          {remaining.map((space, i) => (
            <ScrollReveal key={space.id} delay={(i + 1) * 0.08}>
              <SpaceCard
                slug={space.slug}
                name={space.name}
                description={space.description}
                capacity={space.capacity}
                area={space.area}
                hourlyPrice={space.hourlyPrice}
                dailyPrice={space.dailyPrice}
                mainImageUrl={space.mainImageUrl}
                categoryName={space.categoryName}
                locationName={space.locationName ?? undefined}
                lineAddress={space.lineAddress ?? undefined}
                facilities={space.facilities}
              />
            </ScrollReveal>
          ))}
        </div>
      )}
    </SectionWrapper>
  );
}
