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
        className={`mt-6 font-heading ${getTitleClasses(design)} font-bold leading-[1.2] tracking-tight`}
        style={getTitleStyle(design)}
      >
        <SplitText variant="lines">{heading}</SplitText>
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
      <div
        className={`grid items-center gap-12 md:grid-cols-2 md:gap-16 lg:gap-20${imagePosition === "left" ? " md:[direction:rtl] [&>*]:[direction:ltr]" : ""}`}
      >
        {textBlock}
        {imageBlock}
      </div>
    </SectionWrapper>
  );
}
