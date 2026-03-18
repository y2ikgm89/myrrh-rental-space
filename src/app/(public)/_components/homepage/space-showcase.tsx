import Image from "next/image";
import Link from "next/link";

import { getShowcaseSpaces } from "@/shared/domain/sections/queries";
import { Container } from "../../_shared/components/design-system/container";
import { Heading } from "../../_shared/components/design-system/heading";
import { Button } from "../../_shared/components/design-system/button";
import { Stack } from "../../_shared/components/design-system/stack";
import { ScrollReveal } from "../../_shared/components/animations/scroll-reveal";

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
                <Link
                  href={`/spaces/${space.slug}`}
                  className="group block overflow-hidden rounded-lg border border-border bg-card transition-shadow duration-300 hover:shadow-lg"
                >
                  <div className="aspect-[4/3] overflow-hidden">
                    <Image
                      src={space.mainImageUrl}
                      alt={space.name}
                      width={400}
                      height={300}
                      className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                      sizes="(min-width: 1024px) 33vw, (min-width: 768px) 50vw, 100vw"
                    />
                  </div>
                  <div className="p-5 md:p-6">
                    <h3 className="font-heading text-lg font-semibold tracking-tight">
                      {space.name}
                    </h3>
                    {space.description ? (
                      <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                        {space.description}
                      </p>
                    ) : null}
                    {space.capacity != null || space.hourlyPrice != null ? (
                      <div className="mt-4 flex items-center justify-between border-t border-border pt-4">
                        <span className="text-xs text-muted-foreground">
                          {space.capacity != null
                            ? `${String(space.capacity)}名`
                            : null}
                          {space.capacity != null && space.area != null
                            ? " / "
                            : null}
                          {space.area != null ? (
                            <>{String(space.area)}m&sup2;</>
                          ) : null}
                        </span>
                        {space.hourlyPrice != null ? (
                          <span className="text-sm font-medium text-accent">
                            &yen;{space.hourlyPrice.toLocaleString()}/h
                          </span>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                </Link>
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
