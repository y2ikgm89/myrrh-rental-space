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
import { getPageContent } from "@/public/lib/content/queries";
import { simplePageContentSchema } from "@/public/lib/content/schemas";
import { defaultAboutContent } from "@/public/lib/content/defaults/about";
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

  const [content, sections] = await Promise.all([
    getPageContent("about", simplePageContentSchema, defaultAboutContent),
    getPageSectionsWithFallback("about"),
  ]);

  return (
    <>
      <PageHero
        variant="compact"
        title={content.hero.title}
        breadcrumb={<Breadcrumb items={[{ label: content.hero.title }]} />}
      />

      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}

      <SiteCTA />
    </>
  );
}
