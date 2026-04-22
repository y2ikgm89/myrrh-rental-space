/**
 * MapSection — Google Maps Embed API（公式 API key 必須）
 *
 * Server Component。Maps Embed API で地図を表示。
 * API key は管理画面の「API キー管理」で設定。
 * https://developers.google.com/maps/documentation/embed/get-started
 */

import type { ReactElement } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { Heading } from "@/public/components/design-system/heading";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { BORDER_RADIUS_MAP } from "@/public/lib/section-style-maps";
import type { MapConfig } from "@/shared/lib/validations/section";
import { parseBorderRadius } from "@/shared/lib/validations/section-parsers";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

const HEIGHT_MAP = {
  sm: "h-[300px]",
  md: "h-[400px]",
  lg: "h-[500px]",
} as const;

interface MapSectionProps {
  readonly config: MapConfig;
  readonly style: SectionStylePayload;
  readonly apiKey: string | null;
}

function buildMapEmbedUrl(config: MapConfig, apiKey: string): string | null {
  if (config.latitude != null && config.longitude != null) {
    return `https://www.google.com/maps/embed/v1/view?key=${apiKey}&center=${config.latitude},${config.longitude}&zoom=${config.zoom}&maptype=roadmap`;
  }
  if (config.address) {
    const q = encodeURIComponent(config.address);
    return `https://www.google.com/maps/embed/v1/place?key=${apiKey}&q=${q}&zoom=${config.zoom}`;
  }
  return null;
}

export function MapSection({
  config,
  style,
  apiKey,
}: MapSectionProps): ReactElement {
  const heightClass = HEIGHT_MAP[config.height] ?? HEIGHT_MAP.md;
  const embedUrl = apiKey ? buildMapEmbedUrl(config, apiKey) : null;

  return (
    <SectionWrapper style={style}>
      {config.title && (
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
                {config.title}
              </Heading>
            </div>
          </ScrollReveal>
        </div>
      )}

      <ScrollReveal>
        <div
          className={cn(
            "overflow-hidden",
            BORDER_RADIUS_MAP[parseBorderRadius(config.borderRadius)],
            heightClass,
          )}
        >
          {embedUrl ? (
            <iframe
              src={embedUrl}
              className="h-full w-full border-0"
              allowFullScreen
              loading="lazy"
              referrerPolicy="no-referrer-when-downgrade"
              title={config.title ?? "Google Maps"}
            />
          ) : (
            <div className="flex h-full items-center justify-center bg-muted">
              <p className="text-sm text-muted-foreground">
                地図を表示するには、管理画面で Google Maps API
                キーと住所（または座標）を設定してください。
              </p>
            </div>
          )}
        </div>
      </ScrollReveal>

      {config.showAddressBelow && config.address && (
        <ScrollReveal delay={0.2}>
          <p
            className="mt-4 text-center text-sm text-muted-foreground"
            style={getTextStyle(style)}
          >
            {config.address}
          </p>
        </ScrollReveal>
      )}
    </SectionWrapper>
  );
}
