/**
 * /spaces — スペース一覧（Page-First Architecture）
 *
 * `space-list` セクションの "catalog" variant が FilterBar + SpaceGrid +
 * Pagination を内包する。本ページは sections.map(SectionRenderer) のみで
 * 構成され、searchParams を SectionRenderer に forward する。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SiteCTA } from "@/public/components/layouts/site-cta";

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
  await requireFeatureEnabled("spaces");
  const sections = await getPageSectionsWithFallback("spaces");

  return (
    <PageLayout variant="content" cta={<SiteCTA />}>
      <SectionStack
        sections={sections}
        searchParams={searchParams}
        pageSlug="spaces"
      />
    </PageLayout>
  );
}
