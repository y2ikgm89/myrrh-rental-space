/**
 * ContactFormSection — Configurable contact form section (real submit)
 *
 * Server Component. PublicInquiryFormCard を内包し、Turnstile + 必須規約検証 +
 * Server Action `submitInquiry` で実送信する。`split` variant では BusinessInfo
 * (SC) を sticky sidebar として組み合わせる。
 */

import type { ReactElement } from "react";
import { Suspense } from "react";
import { cn } from "@/shared/lib/cn";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SplitText } from "@/public/components/animations/split-text";
import { Heading } from "@/public/components/design-system/heading";
import { SectionWrapper } from "@/public/components/sections/SectionWrapper";
import {
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/section-style-helpers";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  PublicInquiryFormCard,
  type RequiredInquiryTerm,
} from "@/public/components/forms/public-inquiry-form-card";
import { BusinessInfo } from "../contact/_components/business-info";
import type { ContactFormConfig } from "@/shared/lib/validations/section";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

interface ContactFormSectionProps {
  readonly config: ContactFormConfig;
  readonly style: SectionStylePayload;
  readonly turnstileSiteKey: string | null;
  readonly requiredTerms: readonly RequiredInquiryTerm[];
}

export function ContactFormSection({
  config,
  style,
  turnstileSiteKey,
  requiredTerms,
}: ContactFormSectionProps): ReactElement {
  const variant = config.variant;
  const submitLabel = config.submitButtonText;

  const formCard = (
    <ScrollReveal delay={variant === "split" ? 0.3 : 0.2}>
      <PublicInquiryFormCard
        mode="live"
        turnstileSiteKey={turnstileSiteKey}
        requiredTerms={requiredTerms}
        submitLabel={submitLabel}
      />
    </ScrollReveal>
  );

  // split: 2-column (left=heading/description/BusinessInfo, right=form)
  if (variant === "split") {
    return (
      <SectionWrapper style={style} layout={config.layout}>
        <div className="mx-auto max-w-5xl">
          <div className="grid gap-8 lg:grid-cols-[1fr_360px] lg:gap-12">
            {formCard}
            <aside className="lg:sticky lg:top-[calc(var(--header-height)+2rem)] lg:self-start">
              {config.sectionLabel ? (
                <ScrollReveal>
                  <SectionLabel>{config.sectionLabel}</SectionLabel>
                </ScrollReveal>
              ) : null}
              <div style={getTitleStyle(style)}>
                <Heading
                  level={2}
                  className={cn("mt-4 tracking-tight", getTitleClasses(style))}
                >
                  <SplitText>{config.title}</SplitText>
                </Heading>
              </div>
              {config.description ? (
                <ScrollReveal delay={0.2}>
                  <p
                    className="mt-4 text-sm leading-relaxed text-muted-foreground"
                    style={getTextStyle(style)}
                  >
                    {config.description}
                  </p>
                </ScrollReveal>
              ) : null}
              <ScrollReveal delay={0.4}>
                <div className="mt-8">
                  <Suspense fallback={null}>
                    <BusinessInfo />
                  </Suspense>
                </div>
              </ScrollReveal>
            </aside>
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // default / minimal: centered single column
  return (
    <SectionWrapper style={style} layout={config.layout}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center md:mb-14">
          {config.sectionLabel ? (
            <ScrollReveal>
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            </ScrollReveal>
          ) : null}
          <div style={getTitleStyle(style)}>
            <Heading
              level={2}
              className={cn("mt-4 tracking-tight", getTitleClasses(style))}
            >
              <SplitText>{config.title}</SplitText>
            </Heading>
          </div>
          {config.description ? (
            <ScrollReveal delay={0.2}>
              <p
                className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground"
                style={getTextStyle(style)}
              >
                {config.description}
              </p>
            </ScrollReveal>
          ) : null}
        </div>

        {formCard}
      </div>
    </SectionWrapper>
  );
}
