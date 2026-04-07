import type { ReactElement } from "react";
import { Container } from "@/public/components/design-system/container";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SpacesCarousel } from "./spaces-carousel";

export interface ShowcaseSpace {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
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
}

export const spacesDefaultProps = {
  label: "Selected Spaces",
  title: "厳選スペース",
  count: 6,
} as const;

export function SpacesSection({
  spaces,
  label = spacesDefaultProps.label,
  title = spacesDefaultProps.title,
  count = spacesDefaultProps.count,
}: SpacesSectionProps): ReactElement {
  const limited = spaces.slice(0, count);

  return (
    <section className="py-[var(--spacing-section-compact)]">
      {/* Section header */}
      <Container>
        <ScrollReveal>
          <div className="mb-8 md:mb-16">
            <span className="text-[0.65rem] uppercase tracking-[0.18em] text-muted-foreground">
              {label}
            </span>
            <h2 className="mt-3 font-heading text-h2 font-light italic tracking-tight md:text-h1">
              {title}
            </h2>
            <div className="mt-4 h-px w-12 bg-accent" />
          </div>
        </ScrollReveal>
      </Container>

      {/* Center Stage Carousel */}
      {limited.length > 0 && <SpacesCarousel spaces={limited} />}
    </section>
  );
}
