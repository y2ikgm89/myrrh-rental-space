/**
 * /events — イベント一覧ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * calendar / list / toggle は event-calendar section の variant で表現。
 * list variant の tab/検索/カテゴリー絞り込みのため searchParams を
 * SectionStack に forward する(`spaces/page.tsx` と同型)。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { requireFeatureEnabled } from "@/shared/lib/features/check";
import { requireSystemPagePublished } from "@/shared/lib/pages/require-published";

interface EventsPageProps {
  readonly searchParams: Promise<SearchParams>;
}

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("events");
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
