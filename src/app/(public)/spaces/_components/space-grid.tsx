import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SpaceCard } from "./space-card";

interface Space {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionPlainText: string;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly dailyPrice: number | null;
  readonly facilities: readonly string[];
  readonly lineAddress: string;
  readonly mainImageUrl: string;
  readonly imageUrls: readonly string[];
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
      <p className="py-16 text-center text-muted-foreground">
        現在公開中のスペースはありません
      </p>
    );
  }

  return (
    <div className="grid grid-cols-1 gap-10 sm:grid-cols-2 md:gap-x-10 md:gap-y-14">
      {spaces.map((space, i) => {
        const stats = reviewStats?.[space.id];
        return (
          <ScrollReveal key={space.id} delay={i * 0.08}>
            <div>
              <SpaceCard
                slug={space.slug}
                name={space.name}
                description={space.descriptionPlainText}
                capacity={space.capacity}
                area={space.area}
                hourlyPrice={space.hourlyPrice}
                dailyPrice={space.dailyPrice}
                locationName={space.location.name}
                lineAddress={space.lineAddress}
                facilities={space.facilities}
                mainImageUrl={space.mainImageUrl}
                imageUrls={space.imageUrls}
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
  );
}
