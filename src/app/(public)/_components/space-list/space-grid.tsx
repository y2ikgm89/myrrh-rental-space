import { ScrollRevealGroup } from "@/public/components/animations/scroll-reveal";
import { Button } from "@/public/components/design-system/button";
import { PublicEmptyState } from "@/public/components/ui/empty-state";
import { SpaceCard } from "./space-card";
import type { GalleryItem } from "@/shared/lib/validations/gallery";
import type { TaxRateType } from "@/shared/lib/validations/enums/prisma-types";

interface Space {
  readonly id: string;
  readonly slug: string;
  readonly name: string;
  readonly descriptionPlainText: string;
  readonly capacity: number | null;
  readonly area: number | null;
  readonly hourlyPrice: number | null;
  readonly taxRateType: TaxRateType;
  readonly mainImageUrl: string;
  readonly gallery: readonly GalleryItem[];
  readonly category: { readonly name: string } | null;
  readonly location: { readonly name: string };
  readonly isAvailableForSearch?: boolean | undefined;
}

interface ReviewStats {
  readonly averageRating: number;
  readonly totalCount: number;
}

interface SpaceGridProps {
  readonly spaces: readonly Space[];
  readonly reviewStats?: Readonly<Record<string, ReviewStats>>;
  readonly hasFilters: boolean;
  /**
   * 複製されたセクション同士で同じスペースが描画されても SpaceCard の
   * aria-describedby id がページ内で衝突しないようにする一意キー。
   */
  readonly sectionId: string;
}

export function SpaceGrid({
  spaces,
  reviewStats,
  hasFilters,
  sectionId,
}: SpaceGridProps) {
  if (spaces.length === 0) {
    return (
      <PublicEmptyState
        message={
          hasFilters
            ? "条件に一致するスペースが見つかりませんでした"
            : "現在公開中のスペースはありません"
        }
        action={
          hasFilters ? (
            <Button variant="editorial" size="sm" href="/spaces">
              フィルタを解除
            </Button>
          ) : null
        }
      />
    );
  }

  return (
    <ScrollRevealGroup className="divide-y divide-divider">
      {spaces.map((space, index) => {
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
            taxRateType={space.taxRateType}
            locationName={space.location.name}
            mainImageUrl={space.mainImageUrl}
            gallery={space.gallery}
            categoryName={space.category?.name}
            isAvailableForSearch={space.isAvailableForSearch}
            layout="horizontal"
            imagePriority={index === 0}
            instanceId={sectionId}
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
