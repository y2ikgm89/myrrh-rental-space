/**
 * Homepage — Editorial Magazine layout (DB-driven)
 *
 * PageHero は Page.pageHero（first-class JSON）。本文セクションは homepage-* Section 行。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getHomepagePublicData } from "@/shared/domain/sections/queries";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPublicSettingsForStyle } from "@/shared/domain/settings/queries/display";
import { HomepageSections } from "@/public/components/homepage/HomepageSections";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, homepage, page, settings] = await Promise.all([
    getWebSiteJsonLdData(),
    getHomepagePublicData(),
    getPublicPage("home"),
    getPublicSettingsForStyle(),
  ]);

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <HomepageSections
        pageHero={homepage.pageHero}
        sections={homepage.sections}
        pageStyle={page?.pageStyle ?? null}
        settings={settings}
      />
    </>
  );
}
