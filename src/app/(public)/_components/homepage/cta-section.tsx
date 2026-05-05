import type { ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  DEFAULT_SECTION_STYLE,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";
import type { CTAButtonItem } from "@/shared/lib/validations/cta-and-url";

export interface CtaSectionProps {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly buttons: readonly CTAButtonItem[];
  /** Code-owned visual style for this section. */
  readonly resolvedStyle?: SectionStylePayload;
}

export const ctaDefaultProps: Omit<CtaSectionProps, "resolvedStyle"> = {
  label: "Reservation",
  title: "あなたに最適な空間を",
  description:
    "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
  buttons: [
    {
      text: "View All Spaces",
      url: "/spaces",
      variant: "primary",
      size: "lg",
      iconName: "",
      openInNewTab: false,
    },
  ],
};

export function CtaSection({
  label = ctaDefaultProps.label,
  title = ctaDefaultProps.title,
  description = ctaDefaultProps.description,
  buttons = ctaDefaultProps.buttons,
  resolvedStyle = DEFAULT_SECTION_STYLE,
}: Partial<CtaSectionProps> = {}): ReactElement {
  return (
    <SectionWrapper style={resolvedStyle}>
      <p className="text-[0.8rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>

      <h2 className="mt-4 font-heading text-[clamp(2rem,4vw,3rem)] font-light tracking-tight">
        <SplitText>{title}</SplitText>
      </h2>

      <ScrollReveal delay={0.2}>
        <p className="mx-auto mt-5 max-w-[22rem] text-[0.85rem] leading-[2] text-muted-foreground">
          {description}
        </p>
      </ScrollReveal>

      {buttons.length > 0 && (
        <ScrollReveal delay={0.3}>
          <div className="mt-8 flex flex-wrap justify-center gap-4">
            {buttons.map((button) => (
              <Button
                key={button.url}
                variant="editorial"
                size={button.size}
                href={button.url}
                {...(button.iconName && { iconName: button.iconName })}
                {...(button.backgroundColor && {
                  customBackgroundColor: button.backgroundColor,
                })}
                {...(button.textColor && { customTextColor: button.textColor })}
                {...(button.openInNewTab && { target: "_blank" as const })}
                className="inline-flex min-h-[var(--touch-target-min)] items-center justify-center text-xs uppercase tracking-[0.18em]"
              >
                {button.text}
              </Button>
            ))}
          </div>
        </ScrollReveal>
      )}
    </SectionWrapper>
  );
}
