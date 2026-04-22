import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import { SectionHeader } from "@/public/components/sections/SectionHeader";
import {
  defaultSectionDesign,
  parseSectionDesign,
  type SectionDesign,
} from "@/shared/lib/validations/section";
import { SpacesCarousel } from "./spaces-carousel";

export interface ShowcaseSpace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionPlainText: string;
  readonly capacity: number;
  readonly hourlyPrice: number;
  readonly dailyPrice: number | null;
  readonly area: number | null;
  readonly mainImageUrl: string | null;
  readonly categoryName: string | null;
}

export interface SpacesSectionProps {
  readonly spaces: readonly ShowcaseSpace[];
  readonly label: string;
  readonly title: string;
  readonly count: number;
  readonly autoPlayInterval: number;
  readonly design?: unknown;
}

export const spacesDefaultProps = {
  label: "Selected Spaces",
  title: "厳選スペース",
  count: 6,
  autoPlayInterval: 5,
} as const;

export function SpacesSection({
  spaces,
  label = spacesDefaultProps.label,
  title = spacesDefaultProps.title,
  count = spacesDefaultProps.count,
  autoPlayInterval = spacesDefaultProps.autoPlayInterval,
  design,
}: SpacesSectionProps): ReactElement {
  const limited = spaces.slice(0, count);
  const resolved = parseSectionDesign(design ?? defaultSectionDesign);

  const headerDesign: SectionDesign = {
    ...resolved,
    paddingBottom: "none",
  };
  const carouselDesign: SectionDesign = {
    ...resolved,
    paddingTop: "none",
    maxWidth: "full",
  };

  return (
    <>
      <SectionWrapper design={headerDesign}>
        <ScrollReveal>
          <SectionHeader
            label={label}
            title={title}
            textAlign={resolved.textAlign}
            className="text-center"
          />
        </ScrollReveal>
      </SectionWrapper>
      {limited.length > 0 ? (
        <SectionWrapper design={carouselDesign} skipContainer>
          <SpacesCarousel
            spaces={limited}
            autoPlayInterval={autoPlayInterval}
          />
        </SectionWrapper>
      ) : null}
    </>
  );
}
