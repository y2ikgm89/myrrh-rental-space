/**
 * /about — 会社概要ページ（Page-First アーキテクチャ）
 *
 * SEO: generatePageMetadata
 * コンテンツ: DB セクションを SectionRenderer で描画
 *
 * NOTE: about ページは管理画面でカスタムセクションを使用してコンテンツを構成するため、
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

  return generatePageMetadata("about");
}

export default async function AboutPage(): Promise<ReactElement> {
  await connection();

  const sections = await getPageSectionsWithFallback("about");

  return (
    <>
      <PageHero
        variant="compact"
        title="私たちについて"
        breadcrumb={<Breadcrumb items={[{ label: "私たちについて" }]} />}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <SiteCTA />
    </>
  );
}
