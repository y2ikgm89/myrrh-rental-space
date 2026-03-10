/**
 * /reservation — ご予約ページ
 *
 * パターンB: セクション + カスタムコンテンツ
 * セクション（Hero + SpaceList等）をレンダー後、予約フォームを配置
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { BreadcrumbJsonLd } from "@/public/components/seo/JsonLd";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import { ReservationForm } from "./_components/ReservationForm";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("reservation");
}

export default async function ReservationPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("reservation");

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "ご予約", url: "/reservation" },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <ReservationForm />
    </>
  );
}
