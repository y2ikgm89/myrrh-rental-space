import { Container } from "../../_shared/components/design-system/container";
import { Heading } from "../../_shared/components/design-system/heading";
import { Prose } from "../../_shared/components/design-system/prose";
import { ImageFrame } from "../../_shared/components/design-system/image-frame";
import { ScrollReveal } from "../../_shared/components/animations/scroll-reveal";
import type { HomepageContent } from "../../_shared/lib/content/schemas";

interface ConceptSectionProps {
  readonly content: HomepageContent["concept"];
}

export function ConceptSection({ content }: ConceptSectionProps) {
  return (
    <section className="py-[var(--spacing-section)]">
      <Container>
        <ScrollReveal>
          <div className="grid items-center gap-12 lg:grid-cols-2 lg:gap-16">
            <div>
              <p className="mb-4 text-[length:var(--text-label)] font-medium uppercase tracking-[var(--tracking-wide)] text-muted-foreground">
                {content.label}
              </p>
              <Heading level={2} className="mb-6">
                {content.heading}
              </Heading>
              <Prose>
                <p>{content.body}</p>
              </Prose>
            </div>
            <ImageFrame
              src={content.image.src}
              alt={content.image.alt}
              width={content.image.width}
              height={content.image.height}
              aspect="portrait"
              sizes="(min-width: 1024px) 50vw, 100vw"
            />
          </div>
        </ScrollReveal>
      </Container>
    </section>
  );
}
