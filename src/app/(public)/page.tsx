/**
 * Homepage — セクションベースアーキテクチャ
 *
 * DB セクション（フォールバック: DEFAULT_PAGE_SECTIONS["home"]）を
 * SectionRenderer で描画。
 *
 * SEO: Dynamic metadata via unified pipeline + WebSite JSON-LD
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getHomepageSections } from "@/shared/domain/sections/queries";
import { SectionRenderer } from "@/public/components/sections/SectionRenderer";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getHomepageSections(),
  ]);

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      {sections.map((section) => (
        <SectionRenderer key={section.id} section={section} />
      ))}
    </>
  );
}
