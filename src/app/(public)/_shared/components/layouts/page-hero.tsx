import Image from "next/image";
import type { ReactNode } from "react";
import { Container } from "../design-system/container";
import { Heading } from "../design-system/heading";
import { Stack } from "../design-system/stack";
import { SectionLabel } from "../ui/SectionLabel";

interface ImageRef {
  readonly src: string;
  readonly alt: string;
}

interface PageHeroEditorialProps {
  readonly variant: "editorial";
  readonly title: string;
  readonly subtitle?: string;
  readonly label?: string;
  readonly image: ImageRef;
  readonly breadcrumb?: ReactNode;
}

interface PageHeroCompactProps {
  readonly variant: "compact";
  readonly title: string;
  readonly breadcrumb?: ReactNode;
}

type PageHeroProps = PageHeroEditorialProps | PageHeroCompactProps;

export function PageHero(props: PageHeroProps) {
  if (props.variant === "editorial") {
    return (
      <section
        data-hero=""
        className="relative min-h-[var(--hero-min-height)] bg-surface"
      >
        <div className="grid min-h-[var(--hero-min-height)] grid-cols-1 md:grid-cols-[5fr_4fr]">
          <div className="relative aspect-[4/3] md:aspect-auto">
            <Image
              src={props.image.src}
              alt={props.image.alt}
              fill
              priority
              sizes="(max-width: 768px) 100vw, 55vw"
              className="object-cover"
            />
          </div>
          <div className="flex flex-col justify-center px-[var(--container-padding)] py-12 md:py-0">
            <Stack gap="md">
              {props.breadcrumb}
              {props.label ? <SectionLabel>{props.label}</SectionLabel> : null}
              <Heading level={1}>{props.title}</Heading>
              {props.subtitle ? (
                <p className="max-w-[var(--prose-narrow)] text-lg leading-relaxed text-muted-foreground">
                  {props.subtitle}
                </p>
              ) : null}
            </Stack>
          </div>
        </div>
      </section>
    );
  }

  // compact
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
