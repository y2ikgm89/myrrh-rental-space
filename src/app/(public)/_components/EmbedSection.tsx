/**
 * EmbedSection — External content iframe embed
 *
 * Server Component。YouTube, Google Forms 等の外部コンテンツを埋め込み。
 * Configurable aspect ratio and max width.
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { BORDER_RADIUS_MAP } from "@/public/lib/section-style-maps";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import type { EmbedConfig } from "@/shared/lib/validations/section";
import { parseBorderRadius } from "@/shared/lib/validations/section-parsers";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { PortableTextSpans } from "@/shared/components/portable-text/PortableTextSpans";
import { spansToPlainText } from "@/shared/lib/portable-text";

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
  readonly style: SectionStylePayload;
}

export function EmbedSection({
  config,
  style,
}: EmbedSectionProps): ReactElement {
  const maxWidthClass =
    MAX_WIDTH_MAP[config.layout.containerWidth] ?? MAX_WIDTH_MAP.lg;
  const aspectClass =
    ASPECT_RATIO_MAP[config.aspectRatio] ?? ASPECT_RATIO_MAP["16:9"];
  const radiusClass = BORDER_RADIUS_MAP[parseBorderRadius(config.borderRadius)];

  return (
    <SectionWrapper style={style} layout={config.layout} skipContainer>
      <div className={cn("mx-auto px-5 md:px-8", maxWidthClass)}>
        {config.title.length > 0 && (
          <div className="mb-8 text-center md:mb-12">
            <ScrollReveal>
              {config.sectionLabel && (
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              )}
              <div style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn("mt-4 tracking-tight", getTitleClasses(style))}
                >
                  <PortableTextSpans spans={config.title} />
                </Heading>
              </div>
            </ScrollReveal>
          </div>
        )}

        <ScrollReveal>
          {config.embedUrl ? (
            // embedUrl の iframe は高さを持たないため、aspectRatio="auto"(空クラス)
            // のままだと h-full が置換要素既定の 150px に潰れる。URL 埋め込みでは
            // auto を 16:9 にフォールバックして高さを確定する。
            <div
              className={cn(
                "overflow-hidden",
                radiusClass,
                aspectClass || ASPECT_RATIO_MAP["16:9"],
              )}
            >
              <iframe
                src={config.embedUrl}
                className="h-full w-full border-0"
                allowFullScreen
                loading="lazy"
                title={spansToPlainText(config.title) || "Embedded content"}
              />
            </div>
          ) : config.embedCode ? (
            <SanitizedHtml
              html={config.embedCode}
              className={cn("overflow-hidden", radiusClass, aspectClass)}
            />
          ) : (
            <div
              className={cn(
                "flex h-48 items-center justify-center bg-muted",
                radiusClass,
              )}
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
