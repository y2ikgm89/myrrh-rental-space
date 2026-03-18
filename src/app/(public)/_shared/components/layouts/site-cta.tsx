import { Container } from "../design-system/container";
import { Heading } from "../design-system/heading";
import { Button } from "../design-system/button";
import { Stack } from "../design-system/stack";

interface SiteCTAProps {
  readonly heading?: string;
  readonly body?: string;
  readonly primaryHref?: string;
  readonly primaryLabel?: string;
}

export function SiteCTA({
  heading = "ご予約・お問い合わせ",
  body = "お気軽にご相談ください",
  primaryHref = "/reservation",
  primaryLabel = "予約する",
}: SiteCTAProps) {
  return (
    <section className="bg-surface py-[var(--spacing-section)]">
      <Container>
        <Stack gap="lg" className="items-center text-center">
          <Heading level={2}>{heading}</Heading>
          {body ? (
            <p className="max-w-[50ch] text-muted-foreground">{body}</p>
          ) : null}
          <Stack direction="horizontal" gap="md">
            <Button variant="primary" size="lg" href={primaryHref}>
              {primaryLabel}
            </Button>
            <Button variant="secondary" size="lg" href="/contact">
              お問い合わせ
            </Button>
          </Stack>
        </Stack>
      </Container>
    </section>
  );
}
