import { getRelatedSpaces } from "@/shared/domain/spaces/public-queries";
import { Container } from "@/public/components/design-system/container";
import { Heading } from "@/public/components/design-system/heading";
import { Section } from "@/public/components/design-system/section";
import { SectionLabel } from "@/public/components/ui/SectionLabel";
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
    <Section background="surface">
      <Container>
        <SectionLabel>Related</SectionLabel>
        <Heading level={2} className="mt-4 mb-8">
          関連スペース
        </Heading>
        <div className="@container">
          <div className="grid gap-6 @md:grid-cols-2 @3xl:grid-cols-3">
            {spaces.map((space) => (
              <SpaceCard
                key={space.id}
                slug={space.slug}
                name={space.name}
                description={null}
                capacity={space.capacity}
                area={null}
                hourlyPrice={space.hourlyPrice}
                mainImageUrl={space.mainImageUrl}
                imageUrls={space.imageUrls}
              />
            ))}
          </div>
        </div>
      </Container>
    </Section>
  );
}
