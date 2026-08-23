/**
 * /events — イベント一覧ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * calendar / list / toggle は event-calendar section の variant で表現。
 * list variant の tab/検索/カテゴリー絞り込みのため searchParams を
 * SectionStack に forward する(`spaces/page.tsx` と同型)。
 *
 * `spaces/page.tsx` と同型なのは searchParams forward だけで、`PageLayout` /
 * `SiteCTA` は意図的に持たない。「中間挿入 / SiteCTA なし」は検索性向上の際にも
 * 再検討したうえで維持した方針で、spec の非ゴールにも SiteCTA 追加は含まれない。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { readCanonicalPage } from "@/public/lib/seo/paginated-canonical";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { requireFeatureEnabled } from "@/shared/domain/features/check";
import { requireSystemPagePublished } from "@/shared/domain/pages/require-published-server";

interface EventsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export async function generateMetadata({
  searchParams,
}: EventsPageProps): Promise<Metadata> {
  await connection();
  return generatePageMetadata(
    "events",
    readCanonicalPage((await searchParams)["page"]),
  );
}

export default async function EventsPage({
  searchParams,
}: EventsPageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");
  await requireSystemPagePublished("events");

  const sections = await getPageSectionsWithFallback("events");

  return (
    <>
      <SectionStack
        sections={sections}
        searchParams={searchParams}
        pageSlug="events"
      />
    </>
  );
}
