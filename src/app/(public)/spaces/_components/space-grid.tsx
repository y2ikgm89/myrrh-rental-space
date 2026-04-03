import Image from "next/image";
import Link from "next/link";
import { Container } from "@/public/components/design-system/container";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SpaceCard } from "./space-card";

interface Space {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly description: string | null;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly dailyPrice: number | null;
  readonly facilities: readonly string[];
  readonly lineAddress: string;
  readonly mainImageUrl: string;
  readonly category: { readonly name: string } | null;
  readonly location: { readonly name: string };
}

interface ReviewStats {
  readonly averageRating: number;
  readonly totalCount: number;
}

interface SpaceGridProps {
  readonly spaces: readonly Space[];
  readonly reviewStats?: Readonly<Record<string, ReviewStats>>;
}

export function SpaceGrid({ spaces, reviewStats }: SpaceGridProps) {
  if (spaces.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        現在公開中のスペースはありません
      </p>
    );
  }

  const featured = spaces[0];
  const remaining = spaces.slice(1);
  const featuredStats = featured ? reviewStats?.[featured.id] : undefined;

  return (
    <>
      {/* Featured spread — homepage SpacesSection と同一パターン */}
      {featured ? (
        <Link
          href={`/spaces/${featured.slug}`}
          className="block border-b border-border border-t transition-opacity hover:opacity-95"
        >
          <ScrollReveal>
            <div className="grid grid-cols-1 gap-0 md:grid-cols-[5fr_4fr]">
              <div className="relative aspect-[4/5] md:aspect-auto md:min-h-[28rem]">
                <Image
                  src={featured.mainImageUrl}
                  alt={featured.name}
                  fill
                  className="object-cover"
                  sizes="(max-width: 768px) 100vw, 55vw"
                />
              </div>
              <div className="flex flex-col justify-center px-6 py-8 md:px-10 md:py-12">
                <span className="font-heading text-[5rem] font-light leading-none text-border/60">
                  01
                </span>
                <h3 className="mt-3 font-heading text-[1.75rem] font-light tracking-tight">
                  {featured.name}
                </h3>
                {featured.description ? (
                  <p className="mt-3 max-w-[22rem] text-[0.85rem] leading-[2.2] text-muted-foreground">
                    {featured.description}
                  </p>
                ) : null}
                <dl className="mt-6 grid grid-cols-3 gap-3 border-t border-border pt-4">
                  {featured.area != null ? (
                    <div>
                      <dt className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
                        Area
                      </dt>
                      <dd className="text-[0.85rem]">{featured.area}m²</dd>
                    </div>
                  ) : null}
                  {featured.capacity != null ? (
                    <div>
                      <dt className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
                        Capacity
                      </dt>
                      <dd className="text-[0.85rem]">
                        Max {featured.capacity}
                      </dd>
                    </div>
                  ) : null}
                  {featured.category?.name ? (
                    <div>
                      <dt className="text-[0.55rem] uppercase tracking-[0.18em] text-muted-foreground">
                        Type
                      </dt>
                      <dd className="text-[0.85rem]">
                        {featured.category.name}
                      </dd>
                    </div>
                  ) : null}
                </dl>
                {featured.hourlyPrice != null ? (
                  <p className="mt-4 font-heading text-[1.25rem] text-accent">
                    ¥{featured.hourlyPrice.toLocaleString()}
                    <small className="ml-1 font-sans text-[0.7rem] text-muted-foreground">
                      /h
                    </small>
                  </p>
                ) : null}
                {featuredStats && featuredStats.totalCount > 0 ? (
                  <p className="mt-2 text-sm text-muted-foreground">
                    ★ {featuredStats.averageRating.toFixed(1)} (
                    {featuredStats.totalCount}件)
                  </p>
                ) : null}
              </div>
            </div>
          </ScrollReveal>
        </Link>
      ) : null}

      {/* Remaining — staggered 2-column Kinfolk grid */}
      {remaining.length > 0 ? (
        <Container className="mt-10 md:mt-14">
          <div className="grid grid-cols-1 gap-8 sm:grid-cols-2 md:gap-10">
            {remaining.map((space, i) => {
              const stats = reviewStats?.[space.id];
              return (
                <ScrollReveal key={space.id} delay={(i + 1) * 0.08}>
                  <div className={i % 2 === 1 ? "md:mt-16" : ""}>
                    <SpaceCard
                      slug={space.slug}
                      name={space.name}
                      description={space.description}
                      capacity={space.capacity}
                      area={space.area}
                      hourlyPrice={space.hourlyPrice}
                      dailyPrice={space.dailyPrice}
                      locationName={space.location.name}
                      lineAddress={space.lineAddress}
                      facilities={space.facilities}
                      mainImageUrl={space.mainImageUrl}
                      categoryName={space.category?.name}
                      {...(stats && stats.totalCount > 0
                        ? {
                            averageRating: stats.averageRating,
                            reviewCount: stats.totalCount,
                          }
                        : {})}
                    />
                  </div>
                </ScrollReveal>
              );
            })}
          </div>
        </Container>
      ) : null}
    </>
  );
}
