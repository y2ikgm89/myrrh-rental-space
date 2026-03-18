/**
 * /spaces -- スペース一覧ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: DB から getPageContent + getPublishedSpaces
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { Suspense } from "react";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import {
  spaceListContentSchema,
  defaultSpaceListContent,
} from "@/public/lib/content/schemas/space-list";
import {
  getPublishedSpaces,
  getActiveCategories,
} from "@/shared/domain/spaces/public-queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { FilterBar } from "@/public/components/ui/filter-bar";
import { SpaceGrid } from "./_components/space-grid";

interface SpacesPageProps {
  readonly searchParams: Promise<Record<string, string | string[] | undefined>>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("spaces");
}

export default async function SpacesPage({
  searchParams,
}: SpacesPageProps): Promise<ReactElement> {
  await connection();

  const resolvedParams = await searchParams;
  const categoryId =
    typeof resolvedParams["category"] === "string"
      ? resolvedParams["category"]
      : undefined;

  const [content, spaces, categories] = await Promise.all([
    getPageContent(
      "space-list",
      spaceListContentSchema,
      defaultSpaceListContent,
    ),
    getPublishedSpaces(categoryId),
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
            <p className="mb-8 text-center text-muted-foreground">
              {content.hero.description}
            </p>
          ) : null}
          <Suspense fallback={null}>
            <div className="mb-8">
              <FilterBar categories={categories} />
            </div>
          </Suspense>
          <Suspense fallback={null}>
            <SpaceGrid spaces={spaces} />
          </Suspense>
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
