/**
 * /access — アクセス・拠点情報ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * trailing filter / hero split は廃止し、`sections.map(SectionRenderer)` のみで
 * 構成する。`LocationsLocalBusinessJsonLd` は per-page SEO のため page.tsx 残置。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { SectionStack } from "@/public/components/sections/section-stack";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { getAllPublishedLocationsJsonLdData } from "@/public/lib/seo";
import { LocationsLocalBusinessJsonLd } from "@/public/components/seo/json-ld";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

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
  await requireFeatureEnabled("access");

  const sections = await getPageSectionsWithFallback("access");

  return (
    <PageLayout variant="content">
      <SectionStack sections={sections} pageSlug="access" />

      <Suspense fallback={null}>
        <AccessChaptersJsonLd />
      </Suspense>
    </PageLayout>
  );
}
