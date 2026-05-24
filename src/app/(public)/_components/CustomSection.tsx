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
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { cn } from "@/shared/lib/cn";
import type { CustomConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { SanitizedHtml } from "@/shared/components/SanitizedHtml";

const MAX_WIDTH_MAP = {
  sm: "max-w-2xl",
  md: "max-w-3xl",
  lg: "max-w-4xl",
  xl: "max-w-6xl",
  full: "max-w-full",
} as const;

const PADDING_MAP = {
  none: "",
  sm: "py-[var(--space-sm)]",
  md: "py-[var(--space-md)] md:py-[var(--space-lg)]",
  lg: "py-[var(--space-lg)] md:py-[var(--space-xl)]",
  xl: "py-[var(--space-xl)] md:py-[var(--space-2xl)]",
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
  const paddingClass = PADDING_MAP[config.layout.padding] ?? PADDING_MAP.md;
  const hasTitle = config.title.length > 0;
  const hasBody = config.body.length > 0;

  return (
    <SectionWrapper
      style={style}
      layout={config.layout}
      skipPadding
      skipContainer
    >
      <div className={paddingClass}>
        <div className={cn("mx-auto px-5 md:px-8", maxWidthClass)}>
          {hasTitle && (
            <div className="mb-8 md:mb-12">
              <ScrollReveal>
                {config.sectionLabel && (
                  <SectionLabel>{config.sectionLabel}</SectionLabel>
                )}
                <div className="mt-4" style={getTitleStyle(style)}>
                  <Heading
                    level={2}
                    className={cn(getTitleClasses(style), "tracking-tight")}
                  >
                    {config.title}
                  </Heading>
                </div>
              </ScrollReveal>
            </div>
          )}

          {hasBody && (
            <ScrollReveal>
              <div style={getTextStyle(style)}>
                <SanitizedHtml
                  html={config.body}
                  className="prose prose-neutral max-w-none"
                />
              </div>
            </ScrollReveal>
          )}
        </div>
      </div>
    </SectionWrapper>
  );
}
