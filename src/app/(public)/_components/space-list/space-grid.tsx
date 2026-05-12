import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
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
  readonly hasFilters: boolean;
}

export function SpaceGrid({ spaces, reviewStats, hasFilters }: SpaceGridProps) {
  if (spaces.length === 0) {
    return (
      <div className="space-y-6 py-16 text-center" role="status">
        <p className="text-muted-foreground">
          {hasFilters
            ? "条件に一致するスペースが見つかりませんでした"
            : "現在公開中のスペースはありません"}
        </p>
        {hasFilters && (
          <Button variant="editorial" size="sm" href="/spaces">
            フィルタを解除
          </Button>
        )}
      </div>
    );
  }

  return (
    <ScrollRevealGroup className="divide-y divide-divider">
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
            layout="horizontal"
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
  );
}
