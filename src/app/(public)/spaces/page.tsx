/**
 * /spaces — スペース一覧ページ（セクションベース）
 *
 * SEO: generatePageMetadata
 * Hero はセクションシステムから描画、スペース一覧は中間に配置
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import {
  getPublishedSpacesPaginated,
  getActiveCategories,
} from "@/shared/domain/spaces/public-queries";
import { getSpaceReviewStatsMultiple } from "@/shared/domain/reviews/public-queries";
import { spaceSearchParams } from "@/public/lib/search-params";
import { Container } from "@/public/components/design-system/container";
import { Pagination } from "@/public/components/pagination";
import { FilterBar } from "@/public/components/ui/filter-bar";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { ScrollReveal } from "@/public/components/animations/scroll-reveal";
import { SpaceGrid } from "./_components/space-grid";

interface SpacesPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("spaces");
}

export default async function SpacesPage({
  searchParams,
}: SpacesPageProps): Promise<ReactElement> {
  await connection();

  const { page, category: categoryId } =
    await spaceSearchParams.parse(searchParams);

  const [sections, { items, totalPages, currentPage }, categories] =
    await Promise.all([
      getPageSectionsWithFallback("spaces"),
      getPublishedSpacesPaginated(
        Math.max(1, page),
        undefined,
        categoryId ?? undefined,
      ),
      getActiveCategories(),
    ]);

  const reviewStats = await getSpaceReviewStatsMultiple(items.map((s) => s.id));

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
      cta={<SiteCTA />}
    >
      <section className="py-[var(--spacing-section)]">
        <Container>
          <Suspense fallback={null}>
            <div className="mb-10">
              <FilterBar categories={categories} />
            </div>
          </Suspense>
          <ScrollReveal>
            <Suspense fallback={null}>
              <SpaceGrid spaces={items} reviewStats={reviewStats} />
            </Suspense>
          </ScrollReveal>
          <Pagination
            currentPage={currentPage}
            totalPages={totalPages}
            basePath="/spaces"
            {...(categoryId !== undefined &&
            categoryId !== null &&
            categoryId !== ""
              ? { preservedQuery: { category: categoryId } }
              : {})}
          />
        </Container>
      </section>

      {trailingSections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </PageLayout>
  );
}
