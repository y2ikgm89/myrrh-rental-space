import {
  Sparkles,
  Clock,
  Shield,
  Star,
  Users,
  MapPin,
  Camera,
  Wifi,
  Coffee,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";

import { Container } from "../../_shared/components/design-system/container";
import { Heading } from "../../_shared/components/design-system/heading";
import { Stack } from "../../_shared/components/design-system/stack";
import { ScrollReveal } from "../../_shared/components/animations/scroll-reveal";
import type { HomepageContent } from "../../_shared/lib/content/schemas";

const iconMap: Record<string, LucideIcon> = {
  Sparkles,
  Clock,
  Shield,
  Star,
  Users,
  MapPin,
  Camera,
  Wifi,
  Coffee,
};

interface FeaturesSectionProps {
  readonly content: HomepageContent["features"];
}

export function FeaturesSection({ content }: FeaturesSectionProps) {
  return (
    <section className="bg-surface py-[var(--spacing-section)]">
      <Container>
        <Stack gap="xl" className="items-center text-center">
          <div>
            <p className="mb-4 text-[length:var(--text-label)] font-medium uppercase tracking-[var(--tracking-wide)] text-muted-foreground">
              {content.label}
            </p>
            <Heading level={2}>{content.heading}</Heading>
          </div>
          <div className="grid w-full gap-8 md:grid-cols-2 lg:grid-cols-3">
            {content.items.map((item, i) => (
              <ScrollReveal key={item.title} delay={i * 0.1}>
                <FeatureCard
                  icon={item.icon}
                  title={item.title}
                  description={item.description}
                />
              </ScrollReveal>
            ))}
          </div>
        </Stack>
      </Container>
    </section>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  readonly icon: string;
  readonly title: string;
  readonly description: string;
}) {
  const IconComponent = iconMap[icon];

  return (
    <div className="rounded-lg border border-border bg-card p-8 text-center transition-shadow duration-300 hover:shadow-lg">
      {IconComponent ? (
        <IconComponent className="mx-auto mb-4 h-8 w-8 text-accent" />
      ) : null}
      <h3 className="mb-2 font-heading text-lg font-semibold">{title}</h3>
      <p className="text-sm text-muted-foreground">{description}</p>
    </div>
  );
}
