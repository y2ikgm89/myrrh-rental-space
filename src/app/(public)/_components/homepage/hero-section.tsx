import { PageHero } from "../../_shared/components/layouts/page-hero";
import type { HomepageContent } from "../../_shared/lib/content/schemas";

interface HeroSectionProps {
  readonly content: HomepageContent["hero"];
}

export function HeroSection({ content }: HeroSectionProps) {
  return (
    <PageHero
      variant="full"
      title={content.title}
      subtitle={content.subtitle}
      image={content.image}
      cta={content.cta}
    />
  );
}
