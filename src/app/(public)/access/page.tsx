import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { getAllPublishedLocationsJsonLdData } from "@/public/lib/seo";
import { LocationsLocalBusinessJsonLd } from "@/public/components/seo/json-ld";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("access");
}

async function AccessChaptersJsonLd(): Promise<ReactElement | null> {
  const locations = await getAllPublishedLocationsJsonLdData();
  return <LocationsLocalBusinessJsonLd locations={locations} />;
}

export default async function AccessPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("access");
  const heroSection = sections.find(
    (s) => s.type === "hero" || s.type === "hero-parallax",
  );
  const trailingSections = sections.filter(
    (s) => s !== heroSection && s.type !== "hero" && s.type !== "hero-parallax",
  );

  return (
    <PageLayout
      variant="content"
      hero={heroSection ? <SectionRenderer section={heroSection} /> : undefined}
    >
      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <Suspense fallback={null}>
        <AccessChaptersJsonLd />
      </Suspense>
    </PageLayout>
  );
}
