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
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { parseConceptLayout } from "@/shared/lib/validations/section-parsers";
import type { ConceptConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

/** text-left は CSS デフォルトなので省略し、非デフォルト値のみクラスを付与 */
const TEXT_ALIGN_CLASS: Record<string, string | undefined> = {
  center: "text-center",
  right: "text-right",
};

interface ConceptSectionProps {
  readonly config: ConceptConfig;
  readonly design: SectionDesign;
}

export function ConceptSection({
  config,
  design,
}: ConceptSectionProps): ReactElement {
  const heading = config.heading;
  const body = config.body;
  const imageUrl = config.imageUrl;
  const imagePosition = config.imagePosition;
  const alignClass = TEXT_ALIGN_CLASS[config.textAlign];
  const layout = parseConceptLayout(config.layout);
  const isStacked = layout === "stacked";

  const textBlock = (
    <div className={`${alignClass ?? ""}${isStacked ? " text-center" : ""}`}>
      <ScrollReveal>
        {config.sectionLabel && (
          <SectionLabel>{config.sectionLabel}</SectionLabel>
        )}
      </ScrollReveal>

      <div className="mt-6" style={getTitleStyle(design)}>
        <Heading
          level={2}
          className={`${getTitleClasses(design)} leading-[1.1] tracking-tight`}
        >
          <SplitText>{heading}</SplitText>
        </Heading>
      </div>

      <ScrollReveal delay={0.2}>
        <p
          className={`mt-6 text-sm leading-[1.9] text-muted-foreground md:text-base${isStacked ? " mx-auto max-w-2xl" : ""}`}
          style={getTextStyle(design)}
        >
          {body.split("\n").map((line, i, arr) => (
            // eslint-disable-next-line @eslint-react/no-array-index-key
            <span key={i}>
              {line}
              {i < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      </ScrollReveal>
    </div>
  );

  if (isStacked) {
    return (
      <SectionWrapper design={design}>
        <div className="mx-auto max-w-3xl text-center">
          {imageUrl && (
            <div className="mb-12">
              <ScrollReveal delay={0.1}>
                <ParallaxImage
                  src={imageUrl}
                  alt={config.heading ?? "コンセプト"}
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
    <SectionWrapper design={design} skipContainer>
      <div className="grid grid-cols-1 md:grid-cols-2">
        {/* Image — full bleed, no container padding */}
        <div
          className={`relative min-h-[50vh] md:min-h-[70vh] ${
            imagePosition === "left" ? "md:order-1" : "md:order-2"
          }`}
        >
          {imageUrl ? (
            <ScrollReveal delay={0.1}>
              <ParallaxImage
                src={imageUrl}
                alt={config.heading ?? "コンセプト"}
                className="relative h-full min-h-[50vh] md:min-h-[70vh]"
              />
            </ScrollReveal>
          ) : (
            <div className="h-full bg-surface" />
          )}
        </div>

        {/* Text — centered vertically with generous padding */}
        <div
          className={`flex items-center ${
            imagePosition === "left" ? "md:order-2" : "md:order-1"
          }`}
        >
          <div className="px-6 py-16 md:px-12 md:py-24 lg:px-20">
            {textBlock}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
