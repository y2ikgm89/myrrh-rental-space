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

interface SpaceGridProps {
  readonly spaces: readonly Space[];
}

export function SpaceGrid({ spaces }: SpaceGridProps) {
  if (spaces.length === 0) {
    return (
      <p className="py-12 text-center text-muted-foreground">
        現在公開中のスペースはありません
      </p>
    );
  }

  return (
    <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3 md:gap-8">
      {spaces.map((space) => (
        <SpaceCard
          key={space.id}
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
        />
      ))}
    </div>
  );
}
