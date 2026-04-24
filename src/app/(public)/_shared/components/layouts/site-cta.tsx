import { Container } from "../design-system/container";
import { Heading } from "../design-system/heading";
import { Section } from "../design-system/section";
import { Stack } from "../design-system/stack";
import { Button } from "../design-system/button";
import { ScrollReveal } from "../animations/scroll-reveal";
import type { AppRoute } from "@/shared/lib/typed-routes";

interface SiteCTAProps {
  readonly label?: string;
  readonly title?: string;
  readonly description?: string;
  readonly buttonText?: string;
  readonly buttonHref?: AppRoute;
  readonly background?: "default" | "surface";
  readonly border?: "none" | "top";
}

export function SiteCTA({
  label = "Reservation",
  title = "ご予約はこちらから",
  description,
  buttonText = "予約する",
  buttonHref = "/reservation",
  background = "default",
  border = "top",
}: SiteCTAProps) {
  return (
    <Section background={background} border={border}>
      <Container className="text-center">
        <Stack gap="lg" className="items-center">
          <ScrollReveal>
            <Stack gap="md" className="items-center">
              {label ? (
                <span className="text-xs uppercase tracking-[0.18em] text-muted-foreground">
                  {label}
                </span>
              ) : null}
              <Heading level={2} className="italic">
                {title}
              </Heading>
              {description ? (
                <p className="max-w-[var(--prose-medium)] leading-relaxed text-muted-foreground">
                  {description}
                </p>
              ) : null}
            </Stack>
          </ScrollReveal>
          <ScrollReveal delay={0.15}>
            <Button variant="editorial" size="lg" href={buttonHref}>
              {buttonText}
            </Button>
          </ScrollReveal>
        </Stack>
      </Container>
    </Section>
  );
}
