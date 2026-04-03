/**
 * SpaceShowcase — Space showcase grid (Server Component)
 *
 * Displays spaces in a showcase grid layout with card animations.
 * Used by SectionRenderer for "space-showcase" section type.
 */

import type { ReactElement } from "react";
import Image from "next/image";
import Link from "next/link";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/SectionWrapper";
import { getCardGridColsClass } from "@/public/lib/section-style-maps";
import type { SpaceShowcaseConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

export interface SpaceData {
  readonly id: string;
  readonly name: string;
  readonly nameJa: string;
  readonly tagline: string | null;
  readonly capacity: number | null;
  readonly hourlyPrice: number | null;
  readonly area: number | null;
  readonly imageUrl: string;
  readonly imageAlt: string;
  readonly slug: string;
}

interface SpaceShowcaseProps {
  readonly config: SpaceShowcaseConfig;
  readonly spaces: readonly SpaceData[];
  readonly design: SectionDesign;
}

export function SpaceShowcase({
  config,
  spaces,
  design,
}: SpaceShowcaseProps): ReactElement {
  return (
    <SectionWrapper design={design}>
      <div className="mb-8 text-center md:mb-12">
        <ScrollReveal>
          {config.sectionLabel ? (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          ) : null}
          <div className="mt-4" style={getTitleStyle(design)}>
            <Heading
              level={2}
              className={`${getTitleClasses(design)} tracking-tight`}
            >
              {config.title}
            </Heading>
          </div>
        </ScrollReveal>
      </div>

      <div
        className={`grid gap-6 ${getCardGridColsClass(config.columns)} md:gap-8`}
      >
        {spaces.map((space, i) => (
          <ScrollReveal key={space.id} delay={i * 0.1}>
            <Link
              href={`/spaces/${space.slug}`}
              className="group block overflow-hidden border border-border transition-colors duration-200"
            >
              <div className="aspect-[4/3] overflow-hidden">
                <Image
                  src={space.imageUrl}
                  alt={space.imageAlt}
                  width={400}
                  height={300}
                  className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  sizes={`(max-width: 768px) 100vw, ${Math.round(100 / Math.max(config.columns, 1))}vw`}
                />
              </div>
              <div className="p-4 md:p-5">
                <h3 className="font-heading text-base font-light tracking-tight md:text-lg">
                  {space.name}
                </h3>
                {space.tagline && (
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">
                    {space.tagline}
                  </p>
                )}
                {(space.capacity != null || space.area != null) && (
                  <div className="mt-3 flex items-center border-t border-border pt-3">
                    <span className="text-xs text-muted-foreground">
                      {space.capacity != null && `${space.capacity}名`}
                      {space.capacity != null && space.area != null && " / "}
                      {space.area != null && <>{space.area}m&sup2;</>}
                    </span>
                  </div>
                )}
              </div>
            </Link>
          </ScrollReveal>
        ))}
      </div>
    </SectionWrapper>
  );
}
