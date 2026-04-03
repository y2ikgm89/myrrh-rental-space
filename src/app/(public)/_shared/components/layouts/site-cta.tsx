import { Container } from "../design-system/container";
import { Heading } from "../design-system/heading";
import { Stack } from "../design-system/stack";
import { Button } from "../design-system/button";
import { ScrollReveal } from "../animations/scroll-reveal";

interface SiteCTAProps {
  readonly label?: string;
  readonly title?: string;
  readonly description?: string;
  readonly buttonText?: string;
  readonly buttonHref?: string;
}

export function SiteCTA({
  label = "Reservation",
  title = "ご予約はこちらから",
  description,
  buttonText = "予約する",
  buttonHref = "/reservation",
}: SiteCTAProps) {
  return (
    <section className="bg-foreground py-[var(--spacing-section)]">
      <Container className="text-center">
        <Stack gap="lg" className="items-center">
          <ScrollReveal>
            <Stack gap="md" className="items-center">
              {label ? (
                <span className="text-xs uppercase tracking-[0.18em] text-background/60">
                  {label}
                </span>
              ) : null}
              <Heading level={2} className="italic text-background">
                {title}
              </Heading>
              {description ? (
                <p className="max-w-[45ch] leading-relaxed text-background/70">
                  {description}
                </p>
              ) : null}
            </Stack>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <Button
              variant="editorial"
              size="lg"
              href={buttonHref}
              className="border-background text-background hover:bg-background hover:text-foreground"
            >
              {buttonText}
            </Button>
          </ScrollReveal>
        </Stack>
      </Container>
    </section>
  );
}
