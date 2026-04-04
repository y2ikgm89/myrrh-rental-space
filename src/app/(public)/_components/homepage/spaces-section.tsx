import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/public/components/design-system/button";
import { Container } from "@/public/components/design-system/container";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

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
  const featured = limited[0];
  const remaining = limited.slice(1);

  return (
    <section className="py-[var(--spacing-section-compact)]">
      {/* Section header */}
      <Container>
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
      </Container>

      {/* Featured spread */}
      {featured && (
        <Link
          href={`/spaces/${featured.slug}`}
          className="block border-b border-border border-t transition-opacity hover:opacity-95"
        >
          <ScrollReveal>
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[5fr_4fr]">
              {/* Image */}
              <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[28rem]">
                {featured.mainImageUrl ? (
                  <Image
                    src={featured.mainImageUrl}
                    alt={featured.name}
                    fill
                    className="object-cover"
                    sizes="(max-width: 768px) 100vw, 55vw"
                  />
                ) : (
                  <div className="h-full w-full bg-surface" />
                )}
              </div>
              {/* Content */}
              <div className="flex flex-col justify-center px-6 py-8 md:px-10 md:py-12">
                <span className="font-heading text-[5rem] font-light leading-none text-border/60">
                  01
                </span>
                <h3 className="mt-3 font-heading text-[1.75rem] font-light tracking-tight">
                  {featured.name}
                </h3>
                {featured.description && (
                  <p className="mt-3 max-w-[22rem] text-[0.85rem] leading-[2.2] text-muted-foreground">
                    {featured.description}
                  </p>
                )}
                <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  {featured.area != null && (
                    <div>
                      <dt className="text-[0.625rem] uppercase tracking-[0.15em] text-muted-foreground">
                        Area
                      </dt>
                      <dd className="text-[0.85rem]">{featured.area}m²</dd>
                    </div>
                  )}
                  <div>
                    <dt className="text-[0.625rem] uppercase tracking-[0.15em] text-muted-foreground">
                      Capacity
                    </dt>
                    <dd className="text-[0.85rem]">Max {featured.capacity}</dd>
                  </div>
                  {featured.categoryName && (
                    <div>
                      <dt className="text-[0.625rem] uppercase tracking-[0.15em] text-muted-foreground">
                        Type
                      </dt>
                      <dd className="text-[0.85rem]">
                        {featured.categoryName}
                      </dd>
                    </div>
                  )}
                </dl>
                <p className="mt-4 font-heading text-[1.25rem] text-accent">
                  ¥{featured.hourlyPrice.toLocaleString()}
                  <small className="ml-1 font-sans text-[0.7rem] text-muted-foreground">
                    /h
                  </small>
                </p>
              </div>
            </div>
          </ScrollReveal>
        </Link>
      )}

      {/* Remaining — staggered 2-column grid */}
      {remaining.length > 0 && (
        <Container className="mt-10 md:mt-14">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10">
            {remaining.map((space, i) => (
              <ScrollReveal key={space.id} delay={(i + 1) * 0.1}>
                <Link
                  href={`/spaces/${space.slug}`}
                  className={cn("group block", i % 2 === 1 && "md:mt-16")}
                >
                  <div className="relative aspect-[3/2] overflow-hidden">
                    {space.mainImageUrl ? (
                      <Image
                        src={space.mainImageUrl}
                        alt={space.name}
                        fill
                        className="object-cover transition-opacity duration-400 group-hover:opacity-85"
                        sizes="(max-width: 640px) 100vw, 45vw"
                      />
                    ) : (
                      <div className="h-full w-full bg-surface" />
                    )}
                  </div>
                  {space.categoryName && (
                    <p className="mt-3 text-[0.625rem] uppercase tracking-[0.18em] text-accent">
                      {space.categoryName}
                    </p>
                  )}
                  <h3 className="mt-1 font-heading text-[1.25rem] font-light tracking-tight">
                    {space.name}
                  </h3>
                  <p className="mt-1 text-[0.75rem] text-muted-foreground">
                    {space.area != null && `${space.area}m² · `}Max{" "}
                    {space.capacity} · ¥{space.hourlyPrice.toLocaleString()}/h
                  </p>
                </Link>
              </ScrollReveal>
            ))}
          </div>
        </Container>
      )}

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
