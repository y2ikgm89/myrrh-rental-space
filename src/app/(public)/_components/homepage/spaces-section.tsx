import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import { SectionHeader } from "@/public/components/sections/SectionHeader";
import {
  DEFAULT_SECTION_STYLE,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";
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
  /** Code-owned visual style for this section. */
  readonly resolvedStyle?: SectionStylePayload;
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
  resolvedStyle = DEFAULT_SECTION_STYLE,
}: SpacesSectionProps): ReactElement {
  const limited = spaces.slice(0, count);
  const resolved = resolvedStyle;

  const headerStyle: SectionStylePayload = {
    ...resolved,
    spacing: { ...resolved.spacing, paddingBottom: "none" },
  };
  const carouselStyle: SectionStylePayload = {
    ...resolved,
    spacing: { ...resolved.spacing, paddingTop: "none" },
    container: { maxWidth: "full" },
  };

  return (
    <>
      <SectionWrapper style={headerStyle}>
        <ScrollReveal>
          <SectionHeader
            label={label}
            title={title}
            textAlign={resolved.typography.textAlign}
            className="text-center"
          />
        </ScrollReveal>
      </SectionWrapper>
      {limited.length > 0 ? (
        <SectionWrapper style={carouselStyle} skipContainer>
          <SpacesCarousel
            spaces={limited}
            autoPlayInterval={autoPlayInterval}
          />
        </SectionWrapper>
      ) : null}
    </>
  );
}
