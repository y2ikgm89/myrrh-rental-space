/**
 * Homepage — Editorial Magazine layout
 *
 * Supports Puck visual editor: if puckData exists in DB, sections are rendered
 * in the order and with the props defined by the editor. Otherwise, falls back
 * to the default 6-section layout.
 *
 * Default composition:
 * 1. Hero — magazine cover split (image + text)
 * 2. PullQuote — centered serif italic quote
 * 3. Spaces — featured spread + staggered grid
 * 4. Features — numbered editorial list
 * 5. Stats — inline serif numbers
 * 6. CTA — italic heading + bordered button
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import { getShowcaseSpaces } from "@/shared/domain/sections/queries";
import { getHomepagePuckData } from "@/shared/domain/pages/public-queries";

import {
  HomepageHero,
  heroDefaultProps as heroDefaults,
} from "./_components/homepage/hero-section";
import {
  PullQuoteSection,
  pullQuoteDefaultProps as pullQuoteDefaults,
} from "./_components/homepage/pullquote-section";
import {
  SpacesSection,
  spacesDefaultProps,
  type ShowcaseSpace,
} from "./_components/homepage/spaces-section";
import {
  FeaturesSection,
  featuresDefaultProps as featuresDefaults,
} from "./_components/homepage/features-section";
import { StatsSection } from "./_components/homepage/stats-section";
import {
  CtaSection,
  ctaDefaultProps as ctaDefaults,
} from "./_components/homepage/cta-section";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

/**
 * Puck content item shape (subset we care about for rendering).
 */
interface PuckContentItem {
  readonly type: string;
  readonly props: Record<string, unknown>;
}

interface PuckData {
  readonly content: readonly PuckContentItem[];
}

function isPuckData(value: unknown): value is PuckData {
  if (typeof value !== "object" || value === null) return false;
  return "content" in value && Array.isArray(value.content);
}

function isPuckContentItem(value: unknown): value is PuckContentItem {
  if (typeof value !== "object" || value === null) return false;
  return (
    "type" in value &&
    typeof value.type === "string" &&
    "props" in value &&
    typeof value.props === "object"
  );
}

/** Safely extract a string prop with fallback. */
function str(
  props: Record<string, unknown>,
  key: string,
  fallback: string,
): string {
  const v = props[key];
  return typeof v === "string" ? v : fallback;
}

/** Safely extract a number prop with fallback. */
function num(
  props: Record<string, unknown>,
  key: string,
  fallback: number,
): number {
  const v = props[key];
  return typeof v === "number" ? v : fallback;
}

/**
 * Render a single Puck content item as a React element.
 * SpacesSection receives actual spaces data from DB.
 */
function renderPuckSection(
  item: PuckContentItem,
  spaces: readonly ShowcaseSpace[],
  index: number,
): ReactElement | null {
  const { type, props } = item;
  const key = `puck-${type}-${String(index)}`;

  switch (type) {
    case "HeroSection":
      return (
        <HomepageHero
          key={key}
          label={str(props, "label", heroDefaults.label)}
          title={str(props, "title", heroDefaults.title)}
          description={str(props, "description", heroDefaults.description)}
          imageUrl={str(props, "imageUrl", heroDefaults.imageUrl)}
          imageAlt={str(props, "imageAlt", heroDefaults.imageAlt)}
          buttonText={str(props, "buttonText", heroDefaults.buttonText)}
          buttonUrl={str(props, "buttonUrl", heroDefaults.buttonUrl)}
        />
      );
    case "PullQuoteSection":
      return (
        <PullQuoteSection
          key={key}
          quote={str(props, "quote", pullQuoteDefaults.quote)}
          attribution={str(props, "attribution", pullQuoteDefaults.attribution)}
        />
      );
    case "SpacesSection":
      return (
        <SpacesSection
          key={key}
          spaces={spaces}
          title={str(props, "title", spacesDefaultProps.title)}
          count={num(props, "count", spacesDefaultProps.count)}
        />
      );
    case "FeaturesSection": {
      const title = str(props, "title", featuresDefaults.title);
      const rawItems = props["items"];
      return (
        <FeaturesSection
          key={key}
          title={title}
          {...(Array.isArray(rawItems) && { items: rawItems })}
        />
      );
    }
    case "StatsSection": {
      const rawItems = props["items"];
      return (
        <StatsSection
          key={key}
          {...(Array.isArray(rawItems) && { items: rawItems })}
        />
      );
    }
    case "CtaSection":
      return (
        <CtaSection
          key={key}
          label={str(props, "label", ctaDefaults.label)}
          title={str(props, "title", ctaDefaults.title)}
          description={str(props, "description", ctaDefaults.description)}
          buttonText={str(props, "buttonText", ctaDefaults.buttonText)}
          buttonUrl={str(props, "buttonUrl", ctaDefaults.buttonUrl)}
        />
      );
    default:
      return null;
  }
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, rawSpaces, puckData] = await Promise.all([
    getWebSiteJsonLdData(),
    getShowcaseSpaces(6, true),
    getHomepagePuckData(),
  ]);

  const spaces: ShowcaseSpace[] = rawSpaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    capacity: s.capacity,
    hourlyPrice: s.hourlyPrice,
    area: s.area,
    mainImageUrl: s.mainImageUrl,
    categoryName: s.category?.name ?? null,
  }));

  // If puckData exists in DB, render sections based on the editor data
  if (isPuckData(puckData)) {
    const validItems = puckData.content.filter(isPuckContentItem);
    return (
      <>
        <WebSiteJsonLd
          name={webSiteData.name}
          description={webSiteData.description}
          url={webSiteData.url}
        />
        {validItems.map((item, i) => renderPuckSection(item, spaces, i))}
      </>
    );
  }

  // Fallback: default layout when no puckData has been saved
  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      <HomepageHero />
      <PullQuoteSection />
      <SpacesSection
        spaces={spaces}
        title={spacesDefaultProps.title}
        count={spacesDefaultProps.count}
      />
      <FeaturesSection />
      <StatsSection />
      <CtaSection />
    </>
  );
}
