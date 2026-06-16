/**
 * /reservation — ご予約ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * `reservation-form` セクションが 3-step ウィザードを内包し、
 * `searchParams` を SectionRenderer に forward して `?spaceId=` を反映する。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { PageLayout } from "@/public/components/design-system/page-layout";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("reservation");
}

interface ReservationPageProps {
  searchParams: Promise<SearchParams>;
}

export default async function ReservationPage({
  searchParams,
}: ReservationPageProps): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("reservation");

  const sections = await getPageSectionsWithFallback("reservation");

  return (
    <PageLayout variant="content">
      <SectionStack
        sections={sections}
        searchParams={searchParams}
        pageSlug="reservation"
      />
    </PageLayout>
  );
}
