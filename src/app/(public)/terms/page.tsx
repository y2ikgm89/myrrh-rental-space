/**
 * /terms — 利用規約ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: DB セクションを SectionRenderer で描画
 *
 * NOTE: terms ページは管理画面でカスタムセクションを使用してコンテンツを構成するため、
 * SectionRenderer を維持する。PageHero + Breadcrumb で統一的なヘッダーを提供。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";
import { PageHero } from "@/public/components/layouts/page-hero";
import { Breadcrumb } from "@/public/components/layouts/breadcrumb";
import { SiteCTA } from "@/public/components/layouts/site-cta";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("terms");
}

export default async function TermsPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("terms");

  return (
    <>
      <PageHero
        variant="compact"
        title="利用規約"
        breadcrumb={<Breadcrumb items={[{ label: "利用規約" }]} />}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <SiteCTA />
    </>
  );
}
