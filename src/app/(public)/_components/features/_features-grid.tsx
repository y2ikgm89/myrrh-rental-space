import type { ReactElement } from "react";
import {
  ScrollReveal,
  ScrollRevealGroup,
} from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTextStyle,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { DynamicTablerIcon } from "@/public/components/ui/dynamic-tabler-icon";
import { getCardGridColsClass } from "@/public/lib/section-style-maps";
import { cn } from "@/shared/lib/cn";
import type { FeaturesConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { spansToPlainText } from "@/shared/lib/portable-text";

interface Props {
  readonly config: FeaturesConfig;
  readonly style: SectionStylePayload;
}

export function FeaturesGrid({ config, style }: Props): ReactElement | null {
  if (config.items.length === 0) return null;

  const hasTitle = config.title.length > 0;

  return (
    <SectionWrapper style={style} layout={config.layout}>
      {hasTitle && (
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
                <PortableTextSpans spans={config.title} />
              </Heading>
            </div>
          </ScrollReveal>
        </div>
      )}

      <div className="@container">
        <ScrollRevealGroup
          className={cn(
            "grid gap-6 @md:gap-8",
            getCardGridColsClass(config.columns),
          )}
          stagger={0.08}
        >
          {config.items.map((item) => (
            <article
              key={spansToPlainText(item.title)}
              className="flex flex-col gap-4"
            >
              {item.icon ? (
                <DynamicTablerIcon
                  iconName={item.icon}
                  className="text-accent"
                  size={32}
                  strokeWidth={1}
                  aria-hidden="true"
                />
              ) : null}
              <h3 className="font-heading text-xl font-light tracking-tight">
                <PortableTextSpans spans={item.title} />
              </h3>
              {item.description.length > 0 ? (
                <div
                  className="text-sm leading-[1.9] text-muted-foreground [&_p]:mt-0 [&_p+p]:mt-3"
                  style={getTextStyle(style)}
                >
                  <PortableText blocks={item.description} />
                </div>
              ) : null}
            </article>
          ))}
        </ScrollRevealGroup>
      </div>
    </SectionWrapper>
  );
}
