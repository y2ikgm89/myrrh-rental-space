/**
 * Homepage — Page-First architecture
 *
 * Fetches page content from DB via getPageContent() and renders
 * dedicated section components. SpaceShowcase fetches its own data.
 *
 * SEO: Dynamic metadata via unified pipeline + WebSite JSON-LD
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { Suspense } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/JsonLd";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getPageContent } from "@/public/lib/content/queries";
import { homepageContentSchema } from "@/public/lib/content/schemas";
import { defaultHomepageContent } from "@/public/lib/content/defaults/homepage";
import { SiteCTA } from "@/public/components/layouts/site-cta";
import { HeroSection } from "./_components/homepage/hero-section";
import { ConceptSection } from "./_components/homepage/concept-section";
import { FeaturesSection } from "./_components/homepage/features-section";
import { SpaceShowcase } from "./_components/homepage/space-showcase";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, content] = await Promise.all([
    getWebSiteJsonLdData(),
    getPageContent("homepage", homepageContentSchema, defaultHomepageContent),
  ]);

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <HeroSection content={content.hero} />
      <ConceptSection content={content.concept} />
      <Suspense fallback={null}>
        <SpaceShowcase />
      </Suspense>
      <FeaturesSection content={content.features} />
      <SiteCTA heading={content.cta.heading} body={content.cta.body} />
    </>
  );
}
