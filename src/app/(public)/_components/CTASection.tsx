/**
 * CTASection — Call-to-action with accent background + MagneticButton
 *
 * Single MagneticButton for Reserve Now + underline-reveal text link for Contact.
 * ScrollReveal entrance animation.
 */

import type { ReactElement } from "react";
import Link from "next/link";
import { cn } from "@/shared/lib/cn";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { MagneticButton } from "@/public/components/animations/magnetic-button";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import { Heading } from "@/public/components/design-system/heading";
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
        className={cn(
          "mt-8 flex gap-6 md:mt-12",
          isHorizontal
            ? "flex-row flex-wrap justify-center"
            : "flex-col items-center",
        )}
      >
        {primaryButton && (
          <MagneticButton href={primaryButton.url} strength={0.35}>
            {primaryButton.text}
          </MagneticButton>
        )}
        {secondaryButton && (
          <Link
            href={secondaryButton.url}
            className="group relative inline-block text-xs uppercase tracking-[0.18em] text-background/60 transition-colors hover:text-foreground"
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
            <div style={getTitleStyle(design)}>
              <Heading
                level={2}
                className={cn("mt-6 tracking-tight", getTitleClasses(design))}
              >
                <SplitText>{config.title}</SplitText>
              </Heading>
            </div>
            {config.description && (
              <ScrollReveal delay={0.2}>
                <p
                  className="mt-8 max-w-md text-sm leading-[2] text-muted-foreground md:mt-10 md:text-base"
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

  // centered / default — dark contrast CTA
  return (
    <SectionWrapper
      design={design}
      className="!bg-foreground !text-background"
      {...styleProps}
    >
      <div className="text-center">
        {/* Decorative top line */}
        <div
          className="mx-auto mb-12 h-px w-16 bg-accent/50 md:mb-16"
          aria-hidden="true"
        />

        <ScrollReveal>
          {config.sectionLabel && (
            <p className="text-[10px] uppercase tracking-[0.4em] text-accent">
              {config.sectionLabel}
            </p>
          )}
        </ScrollReveal>

        <Heading
          level={2}
          className="mt-6 text-3xl tracking-tight text-background md:text-4xl lg:text-5xl"
        >
          <SplitText>{config.title}</SplitText>
        </Heading>

        {config.description && (
          <ScrollReveal delay={0.2}>
            <p className="mx-auto mt-8 max-w-lg text-sm leading-[2] text-background/60 md:text-base">
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
