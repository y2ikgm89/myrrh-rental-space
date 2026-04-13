import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
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
}: SpacesSectionProps): ReactElement {
  const limited = spaces.slice(0, count);

  return (
    <section className="py-[var(--spacing-section-compact)]">
      {/* Section header */}
      <Container>
        <ScrollReveal>
          <div className="mb-10 text-center md:mb-14">
            <span className="text-[0.8rem] uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </span>
            <h2 className="mt-4 font-heading text-[clamp(2rem,4vw,3rem)] font-light tracking-tight">
              {title}
            </h2>
          </div>
        </ScrollReveal>
      </Container>

      {/* Center Stage Carousel */}
      {limited.length > 0 && (
        <SpacesCarousel spaces={limited} autoPlayInterval={autoPlayInterval} />
      )}
    </section>
  );
}
