import type { ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
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
          <div className="mb-10 md:mb-14">
            <div className="flex items-baseline justify-between border-b border-border pb-3">
              <span className="text-[0.7rem] uppercase tracking-[0.18em] text-muted-foreground">
                {label}
              </span>
              <span className="text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
                {String(spaces.length).padStart(2, "0")} Selected
              </span>
            </div>
            <h2 className="mt-4 font-heading text-[clamp(1.5rem,2.5vw,2rem)] font-light tracking-tight">
              {title}
            </h2>
          </div>
        </ScrollReveal>
      </Container>

      {/* Horizontal lookbook carousel */}
      {limited.length > 0 && <SpacesCarousel spaces={limited} />}

      {/* View all button */}
      <Container className="mt-10 md:mt-14">
        <ScrollReveal>
          <div className="border-t border-border pt-6 text-center">
            <Button
              variant="editorial"
              href="/spaces"
              className="text-[0.65rem] uppercase tracking-[0.18em]"
            >
              View All Spaces
            </Button>
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
