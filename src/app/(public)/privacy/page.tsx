/**
 * /privacy -- プライバシーポリシーページ
 *
 * SEO: generatePageMetadata + BreadcrumbList JSON-LD
 * コンテンツ: DB セクション（HERO + CUSTOM）を SectionRenderer で描画
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { BreadcrumbJsonLd } from "@/public/components/seo/JsonLd";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("privacy");
}

export default async function PrivacyPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("privacy");

  return (
    <>
      <BreadcrumbJsonLd
        items={[
          { name: "ホーム", url: "/" },
          { name: "プライバシーポリシー", url: "/privacy" },
        ]}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
