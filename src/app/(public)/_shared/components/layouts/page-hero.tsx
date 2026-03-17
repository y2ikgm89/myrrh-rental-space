import Image from "next/image";
import type { ReactNode } from "react";

import type { ButtonItem, ImageRef } from "../../lib/content/types";
import { Button } from "../design-system/button";
import { Container } from "../design-system/container";
import { Heading } from "../design-system/heading";
import { Stack } from "../design-system/stack";

interface PageHeroFullProps {
  readonly variant: "full";
  readonly title: string;
  readonly subtitle?: string;
  readonly image: ImageRef;
  readonly cta?: ButtonItem;
}

interface PageHeroCompactProps {
  readonly variant: "compact";
  readonly title: string;
  readonly breadcrumb?: ReactNode;
}

type PageHeroProps = PageHeroFullProps | PageHeroCompactProps;

export function PageHero(props: PageHeroProps) {
  if (props.variant === "full") {
    return (
      <section className="relative flex min-h-[80vh] items-center justify-center">
        <Image
          src={props.image.src}
          alt={props.image.alt}
          fill
          priority
          sizes="100vw"
          className="object-cover"
        />
        <div className="absolute inset-0 bg-overlay" />
        <Container className="relative z-10 text-center">
          <Stack gap="lg" className="items-center">
            <h1 className="font-heading text-[length:var(--text-hero)] font-bold leading-[var(--leading-tight)] tracking-[var(--tracking-tight)] text-white">
              {props.title}
            </h1>
            {props.subtitle ? (
              <p className="max-w-[50ch] text-lg text-white/80">
                {props.subtitle}
              </p>
            ) : null}
            {props.cta ? (
              <Button
                variant={props.cta.variant}
                size="lg"
                href={props.cta.href}
              >
                {props.cta.label}
              </Button>
            ) : null}
          </Stack>
        </Container>
      </section>
    );
  }

  // Compact variant
  return (
    <section className="bg-surface py-[var(--spacing-block)]">
      <Container>
        <Stack gap="sm">
          {props.breadcrumb}
          <Heading level={1}>{props.title}</Heading>
        </Stack>
      </Container>
    </section>
  );
}
