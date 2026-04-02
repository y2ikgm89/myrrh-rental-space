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
  return (
    <SectionWrapper design={design}>
      <div className="mb-8 text-center md:mb-12">
        <ScrollReveal>
          {config.sectionLabel ? (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          ) : null}
          <h2
            className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
            style={getTitleStyle(design)}
          >
            {config.title}
          </h2>
        </ScrollReveal>
      </div>

      <div
        className={`grid gap-6 ${getCardGridColsClass(config.columns)} md:gap-8`}
      >
        {spaces.map((space, i) => (
          <ScrollReveal key={space.id} delay={i * 0.1}>
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
    </SectionWrapper>
  );
}
