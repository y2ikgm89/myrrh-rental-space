/**
 * SpacesGrid — Featured-first card grid (Server Component)
 *
 * First space rendered as a large featured card; remaining spaces flow into
 * an `@container` grid with card columns from `getCardGridColsClass`.
 */

import type { ReactElement } from "react";
import {
  ScrollReveal,
  ScrollRevealGroup,
} from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { cn } from "@/shared/lib/cn";
import { SpaceCard } from "../space-list/space-card";
import { getCardGridColsClass } from "@/public/lib/section-style-maps";
import type { ShowcaseSpaceData } from "../SpaceShowcaseSection";
import type { SpaceShowcaseConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";

interface Props {
  readonly config: SpaceShowcaseConfig;
  readonly spaces: readonly ShowcaseSpaceData[];
  readonly style: SectionStylePayload;
}

export function SpacesGrid({ config, spaces, style }: Props): ReactElement {
  const featured = spaces[0];
  const remaining = spaces.slice(1);
  const hasTitle = config.title.length > 0;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {hasTitle && (
        <div className="mb-12 flex items-end justify-between md:mb-16">
          <div>
            <ScrollReveal>
              {config.sectionLabel ? (
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              ) : null}
              <div className="mt-4" style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn(getTitleClasses(style), "tracking-tight")}
                >
                  <PortableTextSpans spans={config.title} />
                </Heading>
              </div>
            </ScrollReveal>
          </div>
          <div className="mb-3 hidden flex-1 md:block">
            <div className="ml-12 h-px bg-border" aria-hidden="true" />
          </div>
        </div>
      )}

      {featured ? (
        <ScrollReveal>
          <div className="mb-10 md:mb-16">
            <SpaceCard
              slug={featured.slug}
              name={featured.name}
              description={featured.descriptionPlainText}
              capacity={featured.capacity}
              area={featured.area}
              hourlyPrice={featured.hourlyPrice}
              mainImageUrl={featured.mainImageUrl}
              imageUrls={featured.imageUrls}
              categoryName={featured.categoryName}
              locationName={featured.locationName ?? undefined}
            />
          </div>
        </ScrollReveal>
      ) : null}

      {remaining.length > 0 ? (
        <div className="@container">
          <ScrollRevealGroup
            className={cn(
              "grid gap-6 @md:gap-8",
              getCardGridColsClass(config.columns),
            )}
            stagger={0.08}
          >
            {remaining.map((space) => (
              <SpaceCard
                key={space.id}
                slug={space.slug}
                name={space.name}
                description={space.descriptionPlainText}
                capacity={space.capacity}
                area={space.area}
                hourlyPrice={space.hourlyPrice}
                mainImageUrl={space.mainImageUrl}
                imageUrls={space.imageUrls}
                categoryName={space.categoryName}
                locationName={space.locationName ?? undefined}
              />
            ))}
          </ScrollRevealGroup>
        </div>
      ) : null}
    </SectionWrapper>
  );
}
