/**
 * MapSection — Google Maps embed (API key 不要)
 *
 * Server Component。iframe embed モードで地図を表示。
 * showAddressBelow で地図下に住所テキストを表示。
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { BORDER_RADIUS_MAP } from "@/public/lib/section-style-maps";
import {
  mapConfigSchema,
  parseBorderRadius,
  type MapConfig,
} from "@/shared/lib/validations/section";
import type { SectionComponentProps } from "@/shared/lib/sections/types";

const HEIGHT_MAP = {
  sm: "h-[300px]",
  md: "h-[400px]",
  lg: "h-[500px]",
} as const;

function buildMapEmbedUrl(config: MapConfig): string | null {
  if (config.latitude != null && config.longitude != null) {
    return `https://www.google.com/maps/embed?pb=!1m14!1m12!1m3!1d3000!2d${config.longitude}!3d${config.latitude}!2m3!1f0!2f0!3f0!3m2!1i1024!2i768!4f13.1!5e0!3m2!1sja!2sjp!4v1&z=${config.zoom}`;
  }
  if (config.address) {
    const q = encodeURIComponent(config.address);
    return `https://www.google.com/maps/embed/v1/place?key=&q=${q}&zoom=${config.zoom}`;
  }
  return null;
}

export function MapSection(props: SectionComponentProps): ReactElement {
  const config = mapConfigSchema.parse(props.config);
  const { design } = props;
  const heightClass = HEIGHT_MAP[config.height] ?? HEIGHT_MAP.md;
  const embedUrl = buildMapEmbedUrl(config);

  return (
    <SectionWrapper design={design}>
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
        <div
          className={`overflow-hidden ${BORDER_RADIUS_MAP[parseBorderRadius(config.borderRadius)]} ${heightClass}`}
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
                地図を表示するには、住所または座標を設定してください。
              </p>
            </div>
          )}
        </div>
      </ScrollReveal>

      {config.showAddressBelow && config.address && (
        <ScrollReveal delay={0.2}>
          <p
            className="mt-4 text-center text-sm text-muted-foreground"
            style={getTextStyle(design)}
          >
            {config.address}
          </p>
        </ScrollReveal>
      )}
    </SectionWrapper>
  );
}
