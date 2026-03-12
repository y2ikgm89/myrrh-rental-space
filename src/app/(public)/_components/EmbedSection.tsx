/**
 * EmbedSection — External content iframe embed
 *
 * Server Component。YouTube, Google Forms 等の外部コンテンツを埋め込み。
 * Configurable aspect ratio and max width.
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { BORDER_RADIUS_MAP } from "@/public/lib/section-style-maps";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import {
  embedConfigSchema,
  parseBorderRadius,
} from "@/shared/lib/validations/section";
import type { SectionComponentProps } from "@/shared/lib/sections/types";

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

export function EmbedSection(props: SectionComponentProps): ReactElement {
  const config = embedConfigSchema.parse(props.config);
  const { design } = props;
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
              <h2
                className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
                style={getTitleStyle(design)}
              >
                {config.title}
              </h2>
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
