/**
 * /events — イベント一覧ページ
 *
 * Page-Template Architecture: 全 section を SectionRenderer 経由で描画。
 * filter / 中間挿入 / SiteCTA なし。calendar / list / toggle は event-calendar
 * section の variant で表現。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionStack } from "@/public/components/sections/section-stack";
import { requireFeatureEnabled } from "@/shared/lib/features/check";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("events");
}

export default async function EventsPage(): Promise<ReactElement> {
  await connection();
  await requireFeatureEnabled("events");

  const sections = await getPageSectionsWithFallback("events");

  return (
    <>
      <SectionStack sections={sections} pageSlug="events" />
    </>
  );
}
