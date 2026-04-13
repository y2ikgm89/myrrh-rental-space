import type { ReactElement } from "react";
import { Button } from "@/public/components/design-system/button";
import { SplitText } from "@/public/components/animations/split-text";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export interface CtaSectionProps {
  readonly label: string;
  readonly title: string;
  readonly description: string;
  readonly buttonText: string;
  readonly buttonUrl: string;
}

export const ctaDefaultProps: CtaSectionProps = {
  label: "Reservation",
  title: "あなたに最適な空間を",
  description:
    "空き状況の確認から予約まで、オンラインで完結。まずは空間をご覧ください。",
  buttonText: "View All Spaces",
  buttonUrl: "/spaces",
};

export function CtaSection({
  label = ctaDefaultProps.label,
  title = ctaDefaultProps.title,
  description = ctaDefaultProps.description,
  buttonText = ctaDefaultProps.buttonText,
  buttonUrl = ctaDefaultProps.buttonUrl,
}: Partial<CtaSectionProps> = {}): ReactElement {
  return (
    <section className="px-4 py-[var(--spacing-section-compact)] text-center">
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

      <ScrollReveal delay={0.3}>
        <Button
          variant="editorial"
          href={buttonUrl}
          className="mt-8 text-xs uppercase tracking-[0.18em]"
        >
          {buttonText}
        </Button>
      </ScrollReveal>
    </section>
  );
}
