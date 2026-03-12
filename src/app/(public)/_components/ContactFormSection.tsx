"use client";

/**
 * ContactFormSection — Configurable contact form section
 *
 * Field toggles for name, phone, subject. Email + message always visible.
 * MagneticButton for submit. ScrollReveal for entrance.
 */

import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/ScrollReveal";
import { SplitText } from "@/public/components/animations/SplitText";
import { MagneticButton } from "@/public/components/animations/MagneticButton";
import {
  SectionWrapper,
  getTitleClasses,
  getTitleStyle,
  getTextStyle,
} from "@/public/components/sections/SectionWrapper";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
import {
  contactFormConfigSchema,
  type ContactFormConfig,
} from "@/shared/lib/validations/section";
import type { SectionComponentProps } from "@/shared/lib/sections/types";

const INPUT_CLASS =
  "w-full rounded-lg border border-border bg-card px-4 py-3 text-sm text-foreground focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary";

function ContactForm({
  config,
  showLabels = true,
}: {
  readonly config: ContactFormConfig;
  readonly showLabels?: boolean;
}): ReactElement {
  const labelClass = showLabels
    ? "mb-2 block text-[11px] uppercase tracking-[0.15em] text-muted-foreground"
    : "sr-only";

  return (
    <form onSubmit={(e) => e.preventDefault()} className="space-y-5">
      {config.showNameField ? (
        <div className="grid gap-5 md:grid-cols-2">
          <div>
            <label className={labelClass}>お名前</label>
            <input
              type="text"
              placeholder="山田 太郎"
              className={INPUT_CLASS}
            />
          </div>
          <div>
            <label className={labelClass}>メールアドレス</label>
            <input
              type="email"
              placeholder="mail@example.com"
              className={INPUT_CLASS}
            />
          </div>
        </div>
      ) : (
        <div>
          <label className={labelClass}>メールアドレス</label>
          <input
            type="email"
            placeholder="mail@example.com"
            className={INPUT_CLASS}
          />
        </div>
      )}

      {config.showPhoneField && (
        <div>
          <label className={labelClass}>電話番号</label>
          <input
            type="tel"
            placeholder="090-1234-5678"
            className={INPUT_CLASS}
          />
        </div>
      )}

      {config.showSubjectField && (
        <div>
          <label className={labelClass}>件名</label>
          <input
            type="text"
            placeholder="お問い合わせの件名"
            className={INPUT_CLASS}
          />
        </div>
      )}

      <div>
        <label className={labelClass}>お問い合わせ内容</label>
        <textarea
          rows={5}
          placeholder="お問い合わせ内容をご記入ください"
          className={INPUT_CLASS}
        />
      </div>

      <div className="pt-2">
        <MagneticButton strength={0.2}>
          {config.submitButtonText}
        </MagneticButton>
      </div>

      <p className="text-xs text-muted-foreground">
        ※ これはデモページです。実際の送信は行われません。
      </p>
    </form>
  );
}

export function ContactFormSection(props: SectionComponentProps): ReactElement {
  const config = contactFormConfigSchema.parse(props.config);
  const { design } = props;
  const variant = config.variant;

  // split: 2-column (left=heading/description/contact info, right=form)
  if (variant === "split") {
    return (
      <SectionWrapper design={design}>
        <div className="mx-auto max-w-5xl">
          <div className="flex flex-col gap-12 md:flex-row md:gap-16">
            <div className="flex-1">
              <ScrollReveal>
                {config.sectionLabel && (
                  <SectionLabel>{config.sectionLabel}</SectionLabel>
                )}
              </ScrollReveal>
              <h2
                className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
                style={getTitleStyle(design)}
              >
                <SplitText variant="words">{config.title}</SplitText>
              </h2>
              {config.description && (
                <ScrollReveal delay={0.2}>
                  <p
                    className="mt-4 text-sm leading-relaxed text-muted-foreground"
                    style={getTextStyle(design)}
                  >
                    {config.description}
                  </p>
                </ScrollReveal>
              )}
            </div>
            <div className="flex-1">
              <ScrollReveal delay={0.3}>
                <ContactForm config={config} />
              </ScrollReveal>
            </div>
          </div>
        </div>
      </SectionWrapper>
    );
  }

  // minimal: no labels (placeholder only), compact
  // default: standard centered form
  return (
    <SectionWrapper design={design}>
      <div className="mx-auto max-w-2xl">
        <div className="mb-10 text-center md:mb-14">
          <ScrollReveal>
            {config.sectionLabel && (
              <SectionLabel>{config.sectionLabel}</SectionLabel>
            )}
          </ScrollReveal>
          <h2
            className={`mt-4 font-heading ${getTitleClasses(design)} font-bold tracking-tight`}
            style={getTitleStyle(design)}
          >
            <SplitText variant="words">{config.title}</SplitText>
          </h2>
          {config.description && (
            <ScrollReveal delay={0.2}>
              <p
                className="mx-auto mt-4 max-w-md text-sm leading-relaxed text-muted-foreground"
                style={getTextStyle(design)}
              >
                {config.description}
              </p>
            </ScrollReveal>
          )}
        </div>

        <ScrollReveal delay={0.3}>
          <ContactForm config={config} showLabels={variant !== "minimal"} />
        </ScrollReveal>
      </div>
    </SectionWrapper>
  );
}
