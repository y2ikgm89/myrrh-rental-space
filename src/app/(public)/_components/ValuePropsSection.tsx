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
import type { ValuePropsConfig } from "@/shared/lib/sections/definitions/value-props/schema";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

interface ValuePropsSectionProps {
  readonly config: ValuePropsConfig;
  readonly style: SectionStylePayload;
}

export function ValuePropsSection({
  config,
  style,
}: ValuePropsSectionProps): ReactElement | null {
  if (config.items.length === 0) return null;
  const showHeader = Boolean(config.sectionLabel || config.title);
  const showIcon = config.iconStyle === "tabler";

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {showHeader ? (
        <div className="mb-12 text-center md:mb-16">
          <ScrollReveal>
            {config.sectionLabel ? (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            ) : null}
            {config.title ? (
              <div className="mt-4" style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn(getTitleClasses(style), "tracking-tight")}
                >
                  {config.title}
                </Heading>
              </div>
            ) : null}
          </ScrollReveal>
        </div>
      ) : null}
      <ScrollRevealGroup
        className="flex flex-wrap justify-center gap-x-10 gap-y-6 md:gap-x-16"
        stagger={0.08}
      >
        {config.items.map((item) => (
          <div key={item.title} className="flex items-center gap-3">
            {showIcon && item.icon ? (
              <DynamicTablerIcon
                iconName={item.icon}
                className="text-accent"
                size={28}
                strokeWidth={1.2}
                aria-hidden="true"
              />
            ) : null}
            <span className="text-[0.95rem] tracking-[0.02em] text-foreground/70">
              {item.title}
            </span>
          </div>
        ))}
      </ScrollRevealGroup>
    </SectionWrapper>
  );
}
