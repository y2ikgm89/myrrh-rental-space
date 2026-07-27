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
import {
  getPageSectionsWithFallback,
  type PublicSection,
} from "@/shared/domain/sections/queries";
import { getAllPublishedLocationsJsonLdData } from "@/public/lib/seo";
import { LocationsLocalBusinessJsonLd } from "@/public/components/seo/json-ld";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { requireSystemPagePublished } from "@/shared/domain/pages/require-published-server";
import { SectionType } from "@/shared/lib/validations/section";
import { getLocationListConfig } from "@/shared/lib/validations/section-defaults";

/**
 * ページ上の LocationList セクション（複数あり得る）を横断し、JSON-LD に
 * 含めるべき slug 集合を解決する。mode="all" のセクションが 1 つでもあれば
 * 全公開拠点（undefined）、そうでなければ各セクションの選択 slug の和集合。
 * LocationList セクションが 1 つも無いページ構成では既存挙動を維持し
 * 全公開拠点を対象にする（フォールバック）。
 */
function resolveVisibleLocationSlugs(
  sections: readonly PublicSection[],
): string[] | undefined {
  const locationListSections = sections.filter(
    (section) => section.type === SectionType.LOCATION_LIST,
  );
  if (locationListSections.length === 0) return undefined;

  const slugsPerSection = locationListSections.map((section) => {
    const config = getLocationListConfig(section.config);
    return config.mode === "selected"
      ? config.locationSlugs.map((item) => item.slug)
      : undefined;
  });

  const resolvedSlugLists = slugsPerSection.filter(
    (slugs): slugs is string[] => slugs !== undefined,
  );
  if (resolvedSlugLists.length !== slugsPerSection.length) return undefined;

  return [...new Set(resolvedSlugLists.flat())];
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("access");
}

async function AccessChaptersJsonLd({
  sections,
}: {
  sections: readonly PublicSection[];
}): Promise<ReactElement | null> {
  const slugs = resolveVisibleLocationSlugs(sections);
  const locations = await getAllPublishedLocationsJsonLdData(slugs);
  return <LocationsLocalBusinessJsonLd locations={locations} />;
}

export default async function AccessPage(): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("access");
  await requireSystemPagePublished("access");

  const sections = await getPageSectionsWithFallback("access");

  return (
    <PageLayout variant="content">
      <SectionStack sections={sections} pageSlug="access" />

      <Suspense fallback={null}>
        <AccessChaptersJsonLd sections={sections} />
      </Suspense>
    </PageLayout>
  );
}
