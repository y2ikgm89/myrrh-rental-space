/**
 * CTASection — Call-to-action with accent background + MagneticButton
 *
 * Single MagneticButton for Reserve Now + underline-reveal text link for Contact.
 * ScrollReveal entrance animation.
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { MagneticButton } from "@/public/components/animations/magnetic-button";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import type { CtaConfig } from "@/shared/lib/validations/section";
import type { SectionDesign } from "@/shared/lib/validations/section-design";

interface CTASectionProps {
  readonly config: CtaConfig;
  readonly design: SectionDesign;
}

function CTAButtons({
  primaryButton,
  secondaryButton,
  variant,
}: {
  readonly primaryButton: CtaConfig["buttons"][number] | undefined;
  readonly secondaryButton: CtaConfig["buttons"][number] | undefined;
  readonly variant: CtaConfig["variant"];
}): ReactElement | null {
  if (!primaryButton && !secondaryButton) return null;

  const isHorizontal = variant === "centered" || variant === "split";

  return (
    <ScrollReveal delay={0.3}>
      <div
        className={`mt-8 flex ${isHorizontal ? "flex-row flex-wrap justify-center" : "flex-col items-center"} gap-6 md:mt-12`}
      >
        {primaryButton && (
          <MagneticButton href={primaryButton.url} strength={0.35}>
            {primaryButton.text}
          </MagneticButton>
        )}
        {secondaryButton && (
          <Link
            href={secondaryButton.url}
            className="group relative inline-block text-xs uppercase tracking-[0.2em] text-muted-foreground transition-colors hover:text-accent"
          >
            {secondaryButton.text}
            <span className="absolute bottom-0 left-0 h-px w-0 bg-accent/60 transition-all duration-300 group-hover:w-full" />
          </Link>
        )}
      </div>
    </ScrollReveal>
  );
}

export function CTASection({ config, design }: CTASectionProps): ReactElement {
  const primaryButton = config.buttons.find((b) => b.variant === "primary");
  const secondaryButton = config.buttons.find((b) => b.variant === "secondary");
  const variant = config.variant;
  const styleProps = config.backgroundColor
    ? { style: { backgroundColor: config.backgroundColor } }
    : {};

  // split: 2-column layout (text left, buttons right)
  if (variant === "split") {
    return (
      <SectionWrapper design={design} {...styleProps}>
        <div className="flex flex-col items-center gap-8 md:flex-row md:gap-16">
          <div className="flex-1">
            <ScrollReveal>
              {config.sectionLabel && (
                <SectionLabel>{config.sectionLabel}</SectionLabel>
              )}
            </ScrollReveal>
            <h2
              className={`mt-6 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
              style={getTitleStyle(design)}
            >
              <SplitText>{config.title}</SplitText>
            </h2>
            {config.description && (
              <ScrollReveal delay={0.2}>
                <p
                  className="mt-6 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-8 md:text-base"
                  style={getTextStyle(design)}
                >
                  {config.description}
                </p>
              </ScrollReveal>
            )}
          </div>
          <div className="flex shrink-0 flex-col items-center gap-4">
            <CTAButtons
              primaryButton={primaryButton}
              secondaryButton={secondaryButton}
              variant={variant}
            />
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // centered: larger typography + horizontal buttons
  // default: standard center-aligned with vertical buttons
  return (
    <SectionWrapper design={design} {...styleProps}>
      <div className="text-center">
        <ScrollReveal>
          {config.sectionLabel && (
            <SectionLabel>{config.sectionLabel}</SectionLabel>
          )}
        </ScrollReveal>

        <h2
          className={`mt-6 font-heading ${getTitleClasses(design)} font-bold tracking-tight ${variant === "centered" ? "text-3xl md:text-4xl lg:text-5xl" : ""}`}
          style={getTitleStyle(design)}
        >
          <SplitText>{config.title}</SplitText>
        </h2>

        {config.description && (
          <ScrollReveal delay={0.2}>
            <p
              className="mx-auto mt-6 max-w-md text-sm leading-relaxed text-muted-foreground md:mt-8 md:text-base"
              style={getTextStyle(design)}
            >
              {config.description}
            </p>
          </ScrollReveal>
        )}

        <CTAButtons
          primaryButton={primaryButton}
          secondaryButton={secondaryButton}
          variant={variant}
        />
      </div>
    </SectionWrapper>
  );
}
