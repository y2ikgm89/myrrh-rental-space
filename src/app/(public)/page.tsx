/**
 * Homepage — Editorial Magazine layout (DB-driven)
 *
 * PageHero は Page.pageHero（first-class JSON）。本文セクションは homepage-* Section 行。
 */

import type { Metadata } from "next";
import type { ReactElement } from "react";
import { connection } from "next/server";

import { WebSiteJsonLd } from "@/public/components/seo/json-ld";
import { PageHero } from "@/public/components/page-hero/PageHero";
import { getWebSiteJsonLdData } from "@/public/lib/seo";
import { generatePageMetadata } from "@/public/lib/page-metadata";
import {
  getHomepagePublicData,
  getShowcaseSpaces,
  type PublicSection,
} from "@/shared/domain/sections/queries";
import { getPublicPage } from "@/shared/domain/pages/queries";
import { getPublicSettingsForStyle } from "@/shared/domain/settings/queries/display";
import { resolveSectionStyle } from "@/shared/domain/section-styles/style-resolver";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

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
    autoPlayInterval: num(
      config,
      "autoPlayInterval",
      spacesDefaultProps.autoPlayInterval,
    ),
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

function renderHomepageSection(
  section: PublicSection,
  spaces: readonly ShowcaseSpace[],
  resolvedStyle: SectionStylePayload,
): ReactElement | null {
  const { type, config } = section;

  switch (type) {
    case "homepage-how-it-works":
      return (
        <HowItWorksSection
          key={section.id}
          {...mapHowItWorksConfig(config)}
          resolvedStyle={resolvedStyle}
        />
      );
    case "homepage-spaces":
      return (
        <SpacesSection
          key={section.id}
          spaces={spaces}
          {...mapSpacesConfig(config)}
          resolvedStyle={resolvedStyle}
        />
      );
    case "homepage-features":
      return (
        <FeaturesSection
          key={section.id}
          {...mapFeaturesConfig(config)}
          resolvedStyle={resolvedStyle}
        />
      );
    case "homepage-cta":
      return (
        <CtaSection
          key={section.id}
          {...mapCtaConfig(config)}
          resolvedStyle={resolvedStyle}
        />
      );
    default:
      return null;
  }
}

export default async function HomePage(): Promise<ReactElement> {
  await connection();

  const [webSiteData, rawSpaces, homepage, page, settings] = await Promise.all([
    getWebSiteJsonLdData(),
    getShowcaseSpaces(6, true),
    getHomepagePublicData(),
    getPublicPage("home"),
    getPublicSettingsForStyle(),
  ]);
  const pageForStyle = { pageStyle: page?.pageStyle ?? null };

  const spaces: ShowcaseSpace[] = rawSpaces.map((s) => ({
    id: s.id,
    slug: s.slug,
    name: s.name,
    descriptionPlainText: s.descriptionPlainText,
    capacity: s.capacity,
    hourlyPrice: s.hourlyPrice,
    dailyPrice: s.dailyPrice,
    area: s.area,
    mainImageUrl: s.mainImageUrl,
    categoryName: s.category?.name ?? null,
  }));

  const homepageSections = homepage.sections.filter((s) =>
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
      <PageHero data={homepage.pageHero} />
      {useDefaults ? (
        <>
          <HowItWorksSection />
          <SpacesSection
            spaces={spaces}
            label={spacesDefaultProps.label}
            title={spacesDefaultProps.title}
            count={spacesDefaultProps.count}
            autoPlayInterval={spacesDefaultProps.autoPlayInterval}
          />
          <FeaturesSection />
          <CtaSection />
        </>
      ) : (
        homepageSections.map((section) =>
          renderHomepageSection(
            section,
            spaces,
            resolveSectionStyle(section, pageForStyle, settings),
          ),
        )
      )}
    </>
  );
}
