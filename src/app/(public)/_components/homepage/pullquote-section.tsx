import type { ReactElement } from "react";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";

export interface PullQuoteSectionProps {
  readonly quote: string;
  readonly attribution: string;
}

export const pullQuoteDefaultProps: PullQuoteSectionProps = {
  quote: "良い空間とは、そこにいる人が自分自身に集中できる場所のことだ。",
  attribution: "Myrrh Founder",
};

export function PullQuoteSection({
  quote = pullQuoteDefaultProps.quote,
  attribution = pullQuoteDefaultProps.attribution,
}: Partial<PullQuoteSectionProps> = {}): ReactElement {
  return (
    <section className="bg-surface px-4 py-[var(--spacing-section)]">
      <div className="mx-auto max-w-[50rem] text-center">
        <ScrollReveal>
          <span
            className="mb-6 block font-heading text-[5rem] leading-[0.5] text-accent/20"
            aria-hidden="true"
          >
            &ldquo;
          </span>
        </ScrollReveal>
        <ScrollReveal delay={0.1}>
          <p className="font-heading text-[clamp(1.5rem,2.5vw,2.25rem)] font-light italic leading-[1.7] text-foreground">
            {quote}
          </p>
        </ScrollReveal>
        <ScrollReveal delay={0.2}>
          <p className="mt-6 text-[0.6rem] uppercase tracking-[0.18em] text-muted-foreground">
            — {attribution}
          </p>
        </ScrollReveal>
      </div>
    </section>
  );
}
