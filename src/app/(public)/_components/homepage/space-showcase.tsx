import { getShowcaseSpaces } from "@/shared/domain/sections/queries";
import { Container } from "../../_shared/components/design-system/container";
import { Heading } from "../../_shared/components/design-system/heading";
import { Button } from "../../_shared/components/design-system/button";
import { Stack } from "../../_shared/components/design-system/stack";
import { ScrollReveal } from "../../_shared/components/animations/scroll-reveal";
import { SpaceCard } from "../../spaces/_components/space-card";

export async function SpaceShowcase() {
  const spaces = await getShowcaseSpaces(3, true);

  if (spaces.length === 0) {
    return null;
  }

  return (
    <section className="bg-surface py-[var(--spacing-section)]">
      <Container>
        <Stack gap="xl" className="items-center">
          <ScrollReveal>
            <div className="text-center">
              <p className="mb-4 text-[length:var(--text-label)] font-medium uppercase tracking-[var(--tracking-wide)] text-muted-foreground">
                SPACES
              </p>
              <Heading level={2}>スペース一覧</Heading>
            </div>
          </ScrollReveal>

          <div className="grid w-full gap-6 md:grid-cols-2 md:gap-8 lg:grid-cols-3">
            {spaces.map((space, i) => (
              <ScrollReveal key={space.id} delay={i * 0.1}>
                <SpaceCard
                  slug={space.slug}
                  name={space.name}
                  description={space.description}
                  capacity={space.capacity}
                  area={space.area}
                  hourlyPrice={space.hourlyPrice}
                  dailyPrice={space.dailyPrice}
                  mainImageUrl={space.mainImageUrl}
                  categoryName={space.category?.name}
                  locationName={space.location.name}
                  lineAddress={space.lineAddress}
                  facilities={space.facilities}
                />
              </ScrollReveal>
            ))}
          </div>

          <Button variant="secondary" size="lg" href="/spaces">
            すべてのスペースを見る
          </Button>
        </Stack>
      </Container>
    </section>
  );
}
