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
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { IMAGE_ASPECT_MAP } from "@/public/lib/section-style-maps";
import {
  parseConceptLayout,
  parseImageAspect,
} from "@/shared/lib/validations/section-parsers";
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
  const imageAspect = parseImageAspect(config.imageAspect);
  const aspectClass = IMAGE_ASPECT_MAP[imageAspect];
  const isStacked = layout === "stacked";

  const imageClassName = aspectClass
    ? `relative ${aspectClass} rounded-lg`
    : "relative rounded-lg";

  const textBlock = (
    <div className={`${alignClass ?? ""}${isStacked ? " text-center" : ""}`}>
      <ScrollReveal>
        {config.sectionLabel && (
          <SectionLabel>{config.sectionLabel}</SectionLabel>
        )}
      </ScrollReveal>

      <h2
        className={`mt-6 font-heading ${getTitleClasses(design)} font-light leading-[1.2] tracking-tight`}
        style={getTitleStyle(design)}
      >
        <SplitText>{heading}</SplitText>
      </h2>

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

  const imageBlock = imageUrl ? (
    <ScrollReveal delay={0.1}>
      <ParallaxImage
        src={imageUrl}
        alt={config.heading ?? "コンセプト"}
        className={imageClassName}
      />
    </ScrollReveal>
  ) : null;

  if (isStacked) {
    return (
      <SectionWrapper design={design}>
        <div className="flex flex-col items-center gap-8">
          {imageBlock}
          {textBlock}
        </div>
      </SectionWrapper>
    );
  }

  return (
    <SectionWrapper design={design}>
      <div className="grid grid-cols-1 gap-8 md:grid-cols-12 md:gap-0">
        {/* Image — spans 7 columns */}
        <div
          className={`md:row-start-1 ${
            imagePosition === "left"
              ? "md:col-span-7 md:col-start-1"
              : "md:col-span-7 md:col-start-6"
          }`}
        >
          {imageBlock}
        </div>

        {/* Text — spans 6 columns, overlaps image by 1 column */}
        <div
          className={`md:row-start-1 md:self-center ${
            imagePosition === "left"
              ? "md:col-span-6 md:col-start-6"
              : "md:col-span-6 md:col-start-1"
          }`}
        >
          <div className="relative z-10 bg-background py-8 md:px-10 md:py-12">
            {textBlock}
          </div>
        </div>
      </div>
    </SectionWrapper>
  );
}
