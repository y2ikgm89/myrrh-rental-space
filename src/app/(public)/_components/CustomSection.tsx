/**
 * CustomSection — Lexical HTML レンダリング
 *
 * Server Component。.prose wrapper で Lexical エディタの HTML 出力を表示。
 * SplitText で見出し、ScrollReveal でコンテンツの entrance。
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  SectionTextBox,
  SectionTitleBox,
} from "@/public/components/sections/section-color-boxes";
import { getTitleClasses } from "@/public/components/sections/section-style-helpers";
import { cn } from "@/shared/lib/cn";
import type { CustomConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";
import { sanitizeRenderedRawEmbedHtml } from "@/shared/lib/html/sanitize";

const MAX_WIDTH_MAP = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-full",
} as const;

interface CustomSectionProps {
  readonly config: CustomConfig;
  readonly style: SectionStylePayload;
}

export function CustomSection({
  config,
  style,
}: CustomSectionProps): ReactElement {
  const maxWidthClass =
    MAX_WIDTH_MAP[config.layout.containerWidth] ?? MAX_WIDTH_MAP.lg;
  const hasTitle = config.title.length > 0;
  const hasBody = config.body.length > 0;

  return (
    <SectionWrapper style={style} layout={config.layout} skipContainer>
      <div className={cn("mx-auto px-5 md:px-8", maxWidthClass)}>
        {hasTitle && (
          <div className="mb-8 md:mb-12">
            <ScrollReveal>
              {config.sectionLabel && (
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              )}
              <SectionTitleBox style={style} className="mt-4">
                <Heading
                  level={2}
                  className={cn(getTitleClasses(style), "tracking-tight")}
                >
                  {config.title}
                </Heading>
              </SectionTitleBox>
            </ScrollReveal>
          </div>
        )}

        {hasBody && (
          <ScrollReveal>
            <SectionTextBox style={style}>
              <SanitizedHtml
                sanitizedHtml={sanitizeRenderedRawEmbedHtml(config.body)}
                className="prose prose-neutral max-w-none"
              />
            </SectionTextBox>
          </ScrollReveal>
        )}
      </div>
    </SectionWrapper>
  );
}
