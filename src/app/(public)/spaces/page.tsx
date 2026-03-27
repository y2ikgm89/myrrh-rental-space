/**
 * /spaces -- スペース一覧ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: DB から getPageContent + getPublishedSpaces
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { spaceListContentSchema } from "@/public/lib/content/schemas/space-list";
import { defaultSpaceListContent } from "@/public/lib/content/defaults";
import {
  getPublishedSpacesPaginated,
  getActiveCategories,
} from "@/shared/domain/spaces/public-queries";
import { spaceSearchParams } from "@/public/lib/search-params";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { Pagination } from "@/public/components/pagination";
import { FadeIn } from "@/public/components/animations/fade-in";
import { FilterBar } from "@/public/components/ui/filter-bar";
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

  const [content, { items, totalPages, currentPage }, categories] =
    await Promise.all([
      getPageContent(
        "space-list",
        spaceListContentSchema,
        defaultSpaceListContent,
      ),
      getPublishedSpacesPaginated(
        Math.max(1, page),
        undefined,
        categoryId ?? undefined,
      ),
      getActiveCategories(),
    ]);

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: "スペース一覧" }]} />}
      />

      <section className="py-[var(--spacing-section)]">
        <Container>
          {content.hero.description ? (
            <FadeIn className="mb-8">
              <p className="text-center text-muted-foreground">
                {content.hero.description}
              </p>
            </FadeIn>
          ) : null}
          <Suspense fallback={null}>
            <div className="mb-8">
              <FilterBar categories={categories} />
            </div>
          </Suspense>
          <Suspense fallback={null}>
            <SpaceGrid spaces={items} />
          </Suspense>
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

      <SiteCTA />
    </>
  );
}
