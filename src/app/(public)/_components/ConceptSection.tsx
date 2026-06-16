"use client";

/**
 * ConceptSection — Text + parallax image layout
 *
 * Left: SplitText heading + body text with ScrollReveal
 * Right: ParallaxImage
 */

import type { ReactElement } from "react";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { ParallaxImage } from "@/public/components/animations/parallax-image";
import { cn } from "@/shared/lib/cn";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { parseConceptLayout } from "@/shared/lib/validations/section-parsers";
import type { ConceptConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { PortableText } from "@/shared/components/portable-text/PortableText";
import { spansToPlainText } from "@/shared/lib/portable-text";

/** text-left は CSS デフォルトなので省略し、非デフォルト値のみクラスを付与 */
const TEXT_ALIGN_CLASS: Record<string, string | undefined> = {
  center: "text-center",
  right: "text-right",
};

interface ConceptSectionProps {
  readonly config: ConceptConfig;
  readonly style: SectionStylePayload;
}

export function ConceptSection({
  config,
  style,
}: ConceptSectionProps): ReactElement {
  const heading = config.heading;
  const body = config.body;
  const imageUrl = config.image.url;
  const imageAlt =
    config.image.alt || spansToPlainText(config.heading) || "コンセプト";
  const imagePosition = config.imagePosition;
  const alignClass = TEXT_ALIGN_CLASS[config.textAlign];
  const layout = parseConceptLayout(config.contentLayout);
  const isStacked = layout === "stacked";

  const hasHeading = heading.length > 0;
  const hasBody = body.length > 0;

  const textBlock = (
    <div className={cn(alignClass, isStacked && "text-center")}>
      {config.sectionLabel && (hasHeading || hasBody) && (
        <ScrollReveal>
          <SectionLabel>{config.sectionLabel}</SectionLabel>
        </ScrollReveal>
      )}

      {hasHeading && (
        <div className="mt-6" style={getTitleStyle(style)}>
          <Heading
            level={2}
            className={cn(
              getTitleClasses(style),
              "leading-[1.1] tracking-tight",
            )}
          >
            <SplitText>
              <PortableTextSpans spans={heading} />
            </SplitText>
          </Heading>
        </div>
      )}

      {hasBody && (
        <ScrollReveal delay={0.2}>
          <div
            className={cn(
              "mt-6 text-sm leading-[1.9] text-muted-foreground md:text-base [&_p]:mt-0 [&_p+p]:mt-4",
              isStacked && "mx-auto max-w-2xl",
            )}
            style={getTextStyle(style)}
          >
            <PortableText blocks={body} />
          </div>
        </ScrollReveal>
      )}
    </div>
  );

  if (isStacked) {
    return (
      <SectionWrapper style={style} layout={config.layout}>
        <div className="mx-auto max-w-3xl text-center">
          {imageUrl && (
            <div className="mb-12">
              <ScrollReveal delay={0.1}>
                <ParallaxImage
                  src={imageUrl}
                  alt={imageAlt}
                  className="relative"
                />
              </ScrollReveal>
            </div>
          )}
          {textBlock}
        </div>
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper style={style} layout={config.layout} skipContainer>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Image — full bleed, no container padding */}
        <div
          className={cn(
            "relative min-h-[50svh] md:min-h-[70svh]",
            imagePosition === "left" ? "md:order-1" : "md:order-2",
          )}
        >
          {imageUrl ? (
            <ScrollReveal delay={0.1}>
              <ParallaxImage
                src={imageUrl}
                alt={imageAlt}
                className="relative h-full min-h-[50svh] md:min-h-[70svh]"
              />
            </ScrollReveal>
          ) : (
            <div className="h-full bg-card" />
          )}
        </div>

        {/* Text — centered vertically with generous padding */}
        <div
          className={cn(
            "flex items-center",
            imagePosition === "left" ? "md:order-2" : "md:order-1",
          )}
        >
          <div className="px-6 py-16 md:px-12 md:py-24 lg:px-20">
            {textBlock}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
