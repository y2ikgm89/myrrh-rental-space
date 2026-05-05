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
import { SectionRenderer } from "@/public/components/sections/section-renderer";

export async function generateMetadata(): Promise<Metadata> {
  await connection();
  return generatePageMetadata("events");
}

export default async function EventsPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("events");

  return (
    <>
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} pageSlug="events" />
      ))}
    </>
  );
}
