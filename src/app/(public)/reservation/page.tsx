/**
 * /reservation — ご予約ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * `reservation-form` セクション（Phase 5）が 3-step ウィザードを内包し、
 * `searchParams` を SectionRenderer に forward して `?spaceId=` を反映する。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import type { SearchParams } from "nuqs/server";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { PageLayout } from "@/public/components/design-system/page-layout";

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

  const sections = await getPageSectionsWithFallback("reservation");

  return (
    <PageLayout variant="content">
      {sections.map((section) => (
        <SectionRenderer
          key={section.id}
          section={section}
          searchParams={searchParams}
          pageSlug="reservation"
        />
      ))}
    </PageLayout>
  );
}
