import { getRelatedSpaces } from "@/shared/domain/spaces/public-queries";
import { Container } from "../../../_shared/components/design-system/container";
import { Heading } from "../../../_shared/components/design-system/heading";
import { SpaceCard } from "../../_components/space-card";

interface RelatedSpacesProps {
  readonly currentId: string;
  readonly categoryId: string | null;
}

export async function RelatedSpaces({
  currentId,
  categoryId,
}: RelatedSpacesProps) {
  const spaces = await getRelatedSpaces(currentId, categoryId, 3);
  if (spaces.length === 0) return null;

  return (
    <section className="bg-surface py-[var(--spacing-section)]">
      <Container>
        <Heading level={2} className="mb-8 text-center">
          関連スペース
        </Heading>
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {spaces.map((space) => (
            <SpaceCard
              key={space.id}
              slug={space.slug}
              name={space.name}
              description={null}
              capacity={space.capacity}
              area={null}
              hourlyPrice={Number(space.hourlyPrice)}
              mainImageUrl={space.mainImageUrl}
            />
          ))}
        </div>
      </Container>
    </section>
  );
}
