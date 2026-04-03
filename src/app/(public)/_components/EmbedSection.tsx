/**
 * EmbedSection — External content iframe embed
 *
 * Server Component。YouTube, Google Forms 等の外部コンテンツを埋め込み。
 * Configurable aspect ratio and max width.
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { BORDER_RADIUS_MAP } from "@/public/lib/section-style-maps";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import type { EmbedConfig } from "@/shared/lib/validations/section";
import { parseBorderRadius } from "@/shared/lib/validations/section-parsers";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

const MAX_WIDTH_MAP = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-full",
} as const;

const ASPECT_RATIO_MAP = {
  "16:9": "aspect-video",
  "4:3": "aspect-[4/3]",
  "1:1": "aspect-square",
  auto: "",
} as const;

interface EmbedSectionProps {
  readonly config: EmbedConfig;
  readonly design: SectionDesign;
}

export function EmbedSection({
  config,
  design,
}: EmbedSectionProps): ReactElement {
  const maxWidthClass = MAX_WIDTH_MAP[config.maxWidth] ?? MAX_WIDTH_MAP.lg;
  const aspectClass =
    ASPECT_RATIO_MAP[config.aspectRatio] ?? ASPECT_RATIO_MAP["16:9"];
  const radiusClass = BORDER_RADIUS_MAP[parseBorderRadius(config.borderRadius)];

  return (
    <SectionWrapper design={design} skipContainer>
      <div className={`mx-auto px-5 md:px-8 ${maxWidthClass}`}>
        {config.title && (
          <div className="mb-8 text-center md:mb-12">
            <ScrollReveal>
              {config.sectionLabel && (
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              )}
              <div style={getTitleStyle(design)}>
                <Heading
                  level={2}
                  className={`mt-4 ${getTitleClasses(design)} tracking-tight`}
                >
                  {config.title}
                </Heading>
              </div>
            </ScrollReveal>
          </div>
        )}

        <ScrollReveal>
          {config.embedUrl ? (
            <div className={`overflow-hidden ${radiusClass} ${aspectClass}`}>
              <iframe
                src={config.embedUrl}
                className="h-full w-full border-0"
                allowFullScreen
                loading="lazy"
                title={config.title ?? "Embedded content"}
              />
            </div>
          ) : config.embedCode ? (
            <SanitizedHtml
              html={config.embedCode}
              className={`overflow-hidden ${radiusClass} ${aspectClass}`}
            />
          ) : (
            <div
              className={`flex h-48 items-center justify-center ${radiusClass} bg-muted`}
            >
              <p className="text-sm text-muted-foreground">
                埋め込みURLまたはコードを設定してください。
              </p>
            </div>
          )}
        </ScrollReveal>
      </div>
    </SectionWrapper>
  );
}
