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
import { DynamicTablerIcon } from "@/public/components/ui/dynamic-tabler-icon";
import { cn } from "@/shared/lib/cn";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

interface Props {
  readonly config: FeaturesConfig;
  readonly style: SectionStylePayload;
}

export function FeaturesNumberedSteps({
  config,
  style,
}: Props): ReactElement | null {
  if (config.items.length === 0) return null;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className="mb-12 text-center md:mb-16">
        <ScrollReveal>
          {config.sectionLabel ? (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          ) : null}
          <div className="mt-4" style={getTitleStyle(style)}>
            <Heading
              level={2}
              className={cn(getTitleClasses(style), "tracking-tight")}
            >
              {config.title}
            </Heading>
          </div>
        </ScrollReveal>
      </div>

      <ScrollRevealGroup className="grid grid-cols-1 gap-10 sm:grid-cols-3 sm:gap-8 md:gap-12">
        {config.items.map((step, i) => (
          <div key={step.title} className="text-center">
            {step.icon ? (
              <div className="mb-5 flex justify-center">
                <DynamicTablerIcon
                  iconName={step.icon}
                  className="text-accent"
                  size={36}
                  strokeWidth={1}
                  aria-hidden="true"
                />
              </div>
            ) : null}
            <span
              className="mb-4 block font-heading text-[2.5rem] font-light italic text-accent/50"
              aria-hidden="true"
            >
              {String(i + 1).padStart(2, "0")}
            </span>
            <h3 className="font-heading text-xl font-light tracking-[0.01em]">
              {step.title}
            </h3>
            {step.description ? (
              <p className="mt-3 text-sm leading-[1.8] text-muted-foreground">
                {step.description}
              </p>
            ) : null}
          </div>
        ))}
      </ScrollRevealGroup>
    </SectionWrapper>
  );
}
