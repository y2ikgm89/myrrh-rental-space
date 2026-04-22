import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { SpaceCard } from "./space-card";

interface Space {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionPlainText: string;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
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
    <div className="@container">
      <ScrollRevealGroup className="grid grid-cols-1 gap-10 @md:grid-cols-2 @3xl:grid-cols-3 @md:gap-x-10 @md:gap-y-14">
        {spaces.map((space) => {
          const stats = reviewStats?.[space.id];
          return (
            <SpaceCard
              key={space.id}
              slug={space.slug}
              name={space.name}
              description={space.descriptionPlainText}
              capacity={space.capacity}
              area={space.area}
              hourlyPrice={space.hourlyPrice}
              locationName={space.location.name}
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
          );
        })}
      </ScrollRevealGroup>
    </div>
  );
}
