/**
 * Homepage — 統一テンプレート (Page Template Architecture)
 *
 * 全公開ページと同じく `getPageSectionsWithFallback("home")` + `<SectionRenderer>` で描画する。
 * PageHero は order=-1 の `page-hero` Section として SectionRenderer に統合済み。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { SectionRenderer } from "@/public/components/sections/section-renderer";
import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageSectionsWithFallback } from "@/shared/domain/sections/queries";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getPageSectionsWithFallback("home"),
  ]);

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} pageSlug="home" />
      ))}
    </>
  );
}
