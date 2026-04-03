import type { ReactElement } from "react";
import Link from "next/link";
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
  title: "Find your perfect room",
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
    <section className="px-4 py-[var(--spacing-section)] text-center">
      <p className="mb-5 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
        {label}
      </p>

      <h2 className="font-heading text-[clamp(2rem,3.5vw,3rem)] font-light italic leading-[1.25] tracking-tight">
        <SplitText>{title}</SplitText>
      </h2>

      <ScrollReveal delay={0.2}>
        <p className="mx-auto mt-5 max-w-[22rem] text-[0.85rem] leading-[2] text-muted-foreground">
          {description}
        </p>
      </ScrollReveal>

      <ScrollReveal delay={0.3}>
        <Link
          href={buttonUrl}
          className="mt-8 inline-block border border-foreground px-8 py-3 text-[0.65rem] uppercase tracking-[0.18em] text-foreground transition-colors duration-300 hover:bg-foreground hover:text-background"
        >
          {buttonText}
        </Link>
      </ScrollReveal>
    </section>
  );
}
