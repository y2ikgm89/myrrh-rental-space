/**
 * Homepage — Editorial Magazine layout (DB-driven)
 *
 * Reads section configs from DB via getHomepageSections().
 * Each homepage-* section type maps to an editorial component.
 * Falls back to DEFAULT_PAGE_SECTIONS["home"] when DB is empty.
 *
 * Section types:
 * 1. homepage-hero — magazine cover split (image + text)
 * 2. homepage-how-it-works — 3-step reservation flow + value props strip
 * 3. homepage-spaces — featured spread + staggered grid (DB data injected)
 * 4. homepage-features — numbered editorial list
 * 5. homepage-cta — italic heading + bordered button
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import {
  getHomepageSections,
  getShowcaseSpaces,
  type PublicSection,
} from "@/shared/domain/sections/queries";

import {
  HomepageHero,
  heroDefaultProps,
  type HeroSectionProps,
} from "./_components/homepage/hero-section";
import {
  HowItWorksSection,
  howItWorksDefaultProps,
  type HowItWorksSectionProps,
} from "./_components/homepage/how-it-works-section";
import {
  SpacesSection,
  spacesDefaultProps,
  type ShowcaseSpace,
} from "./_components/homepage/spaces-section";
import {
  FeaturesSection,
  featuresDefaultProps,
  type FeaturesSectionProps,
} from "./_components/homepage/features-section";
import {
  CtaSection,
  ctaDefaultProps,
  type CtaSectionProps,
} from "./_components/homepage/cta-section";

export async function generateMetadata(): Promise<Metadata> {
  await connection();

  return generatePageMetadata("home");
}

/* -------------------------------------------------------------------------- */
/*  Config → Props mappers (type-safe extraction from DB JSON)                */
/* -------------------------------------------------------------------------- */

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(config: unknown, key: string, fallback: string): string {
  if (!isRecord(config)) return fallback;
  const v = config[key];
  return typeof v === "string" ? v : fallback;
}

function num(config: unknown, key: string, fallback: number): number {
  if (!isRecord(config)) return fallback;
  const v = config[key];
  return typeof v === "number" ? v : fallback;
}

function arr(config: unknown, key: string): unknown[] | undefined {
  if (!isRecord(config)) return undefined;
  const v = config[key];
  return Array.isArray(v) ? v : undefined;
}

function isStringPair(v: unknown): v is { title: string; description: string } {
  return (
    isRecord(v) &&
    typeof v["title"] === "string" &&
    typeof v["description"] === "string"
  );
}

function isTitled(v: unknown): v is { title: string } {
  return isRecord(v) && typeof v["title"] === "string";
}

function mapHeroConfig(config: unknown): HeroSectionProps {
  return {
    label: str(config, "label", heroDefaultProps.label),
    title: str(config, "title", heroDefaultProps.title),
    description: str(config, "description", heroDefaultProps.description),
    imageUrl: str(config, "imageUrl", heroDefaultProps.imageUrl),
    imageAlt: str(config, "imageAlt", heroDefaultProps.imageAlt),
    buttonText: str(config, "buttonText", heroDefaultProps.buttonText),
    buttonUrl: str(config, "buttonUrl", heroDefaultProps.buttonUrl),
  };
}

function mapHowItWorksConfig(config: unknown): Partial<HowItWorksSectionProps> {
  const rawSteps = arr(config, "steps");
  const rawValueProps = arr(config, "valueProps");
  return {
    label: str(config, "label", howItWorksDefaultProps.label),
    title: str(config, "title", howItWorksDefaultProps.title),
    ...(rawSteps && { steps: rawSteps.filter(isStringPair) }),
    ...(rawValueProps && { valueProps: rawValueProps.filter(isTitled) }),
  };
}

function mapSpacesConfig(config: unknown) {
  return {
    label: str(config, "label", spacesDefaultProps.label),
    title: str(config, "title", spacesDefaultProps.title),
    count: num(config, "count", spacesDefaultProps.count),
  };
}

function mapFeaturesConfig(config: unknown): Partial<FeaturesSectionProps> {
  const rawItems = arr(config, "items");
  return {
    label: str(config, "label", featuresDefaultProps.label),
    title: str(config, "title", featuresDefaultProps.title),
    ...(rawItems && { items: rawItems.filter(isStringPair) }),
  };
}

function mapCtaConfig(config: unknown): CtaSectionProps {
  return {
    label: str(config, "label", ctaDefaultProps.label),
    title: str(config, "title", ctaDefaultProps.title),
    description: str(config, "description", ctaDefaultProps.description),
    buttonText: str(config, "buttonText", ctaDefaultProps.buttonText),
    buttonUrl: str(config, "buttonUrl", ctaDefaultProps.buttonUrl),
  };
}

/* -------------------------------------------------------------------------- */
/*  Section renderer                                                          */
/* -------------------------------------------------------------------------- */

function renderHomepageSection(
  section: PublicSection,
  spaces: readonly ShowcaseSpace[],
): ReactElement | null {
  const { type, config } = section;

  switch (type) {
    case "homepage-hero":
      return <HomepageHero key={section.id} {...mapHeroConfig(config)} />;
    case "homepage-how-it-works":
      return (
        <HowItWorksSection key={section.id} {...mapHowItWorksConfig(config)} />
      );
    case "homepage-spaces":
      return (
        <SpacesSection
          key={section.id}
          spaces={spaces}
          {...mapSpacesConfig(config)}
        />
      );
    case "homepage-features":
      return (
        <FeaturesSection key={section.id} {...mapFeaturesConfig(config)} />
      );
    case "homepage-cta":
      return <CtaSection key={section.id} {...mapCtaConfig(config)} />;
    default:
      return null;
  }
}

/* -------------------------------------------------------------------------- */
/*  Page component                                                            */
/* -------------------------------------------------------------------------- */

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, rawSpaces, sections] = await Promise.all([
    getWebSiteJsonLdData(),
    getShowcaseSpaces(6, true),
    getHomepageSections(),
  ]);

  const spaces: ShowcaseSpace[] = rawSpaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    description: s.description,
    capacity: s.capacity,
    hourlyPrice: s.hourlyPrice,
    dailyPrice: s.dailyPrice,
    area: s.area,
    mainImageUrl: s.mainImageUrl,
    categoryName: s.category?.name ?? null,
  }));

  // Filter for homepage-* sections only; fall back to defaults if none match
  const homepageSections = sections.filter((s) =>
    s.type.startsWith("homepage-"),
  );
  const useDefaults = homepageSections.length === 0;

  return (
    <>
      <WebSiteJsonLd
        name={webSiteData.name}
        description={webSiteData.description}
        url={webSiteData.url}
      />
      {useDefaults ? (
        <>
          <HomepageHero />
          <HowItWorksSection />
          <SpacesSection
            spaces={spaces}
            label={spacesDefaultProps.label}
            title={spacesDefaultProps.title}
            count={spacesDefaultProps.count}
          />
          <FeaturesSection />
          <CtaSection />
        </>
      ) : (
        homepageSections.map((section) =>
          renderHomepageSection(section, spaces),
        )
      )}
    </>
  );
}
