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
import { getPublishedSpaces } from "@/shared/domain/spaces/public-queries";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { Container } from "@/public/components/design-system/container";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { SpaceGrid } from "./_components/space-grid";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("spaces");
}

export default async function SpacesPage(): Promise<ReactElement> {
  await connection();

  const [content, spaces] = await Promise.all([
    getPageContent(
      "space-list",
      spaceListContentSchema,
      defaultSpaceListContent,
    ),
    getPublishedSpaces(),
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
            <SpaceGrid spaces={spaces} />
          </Suspense>
        </Container>
      </section>

      <SiteCTA />
    </>
  );
}
