import type { ReactElement } from "react";
import { PageHero } from "@/public/components/page-hero/PageHero";
import { getShowcaseSpaces } from "@/shared/domain/sections/queries";
import { resolveSectionStyle } from "@/shared/domain/section-styles/style-resolver";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import type {
  PublicSectionStyle,
  PublicSettingsForStyle,
} from "@/shared/domain/sections/queries";
import {
  HowItWorksSection,
  howItWorksDefaultProps,
  type HowItWorksSectionProps,
} from "../../../_components/homepage/how-it-works-section";
import {
  SpacesSection,
  spacesDefaultProps,
  type ShowcaseSpace,
} from "../../../_components/homepage/spaces-section";
import {
  FeaturesSection,
  featuresDefaultProps,
  type FeaturesSectionProps,
} from "../../../_components/homepage/features-section";
import {
  CtaSection,
  ctaDefaultProps,
  type CtaSectionProps,
} from "../../../_components/homepage/cta-section";
import { isAppRoute, type AppRoute } from "@/shared/lib/typed-routes";

type HomepageRenderableSection = {
  readonly id: string;
  readonly type: string;
  readonly config: unknown;
  readonly style: PublicSectionStyle | null;
  readonly styleOverride: unknown | null;
};

interface HomepageSectionsProps {
  readonly pageHero: unknown;
  readonly sections: readonly HomepageRenderableSection[];
  readonly pageStyle: PublicSectionStyle | null;
  readonly settings: PublicSettingsForStyle;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(config: unknown, key: string, fallback: string): string {
  if (!isRecord(config)) return fallback;
  const value = config[key];
  return typeof value === "string" ? value : fallback;
}

function appRoute(config: unknown, key: string, fallback: AppRoute): AppRoute {
  const value = str(config, key, fallback);
  return isAppRoute(value) ? value : fallback;
}

function num(config: unknown, key: string, fallback: number): number {
  if (!isRecord(config)) return fallback;
  const value = config[key];
  return typeof value === "number" ? value : fallback;
}

function arr(config: unknown, key: string): unknown[] | undefined {
  if (!isRecord(config)) return undefined;
  const value = config[key];
  return Array.isArray(value) ? value : undefined;
}

function isStringPair(value: unknown): value is {
  title: string;
  description: string;
} {
  return (
    isRecord(value) &&
    typeof value["title"] === "string" &&
    typeof value["description"] === "string"
  );
}

function isTitled(value: unknown): value is { title: string } {
  return isRecord(value) && typeof value["title"] === "string";
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
    buttonUrl: appRoute(config, "buttonUrl", ctaDefaultProps.buttonUrl),
  };
}

function renderHomepageSection(
  section: HomepageRenderableSection,
  spaces: readonly ShowcaseSpace[],
  resolvedStyle: SectionStylePayload,
): ReactElement | null {
  switch (section.type) {
    case "homepage-how-it-works":
      return (
        <HowItWorksSection
          key={section.id}
          {...mapHowItWorksConfig(section.config)}
          resolvedStyle={resolvedStyle}
        />
      );

    case "homepage-spaces":
      return (
        <SpacesSection
          key={section.id}
          spaces={spaces}
          {...mapSpacesConfig(section.config)}
          resolvedStyle={resolvedStyle}
        />
      );

    case "homepage-features":
      return (
        <FeaturesSection
          key={section.id}
          {...mapFeaturesConfig(section.config)}
          resolvedStyle={resolvedStyle}
        />
      );

    case "homepage-cta":
      return (
        <CtaSection
          key={section.id}
          {...mapCtaConfig(section.config)}
          resolvedStyle={resolvedStyle}
        />
      );

    default:
      return null;
  }
}

export async function HomepageSections({
  pageHero,
  sections,
  pageStyle,
  settings,
}: HomepageSectionsProps): Promise<ReactElement> {
  const rawSpaces = await getShowcaseSpaces(6, true);
  const spaces: ShowcaseSpace[] = rawSpaces.map((space) => ({
    id: space.id,
    slug: space.slug,
    name: space.name,
    descriptionPlainText: space.descriptionPlainText,
    capacity: space.capacity,
    hourlyPrice: space.hourlyPrice,
    dailyPrice: space.dailyPrice,
    area: space.area,
    mainImageUrl: space.mainImageUrl,
    categoryName: space.category?.name ?? null,
  }));

  const homepageSections = sections.filter((section) =>
    section.type.startsWith("homepage-"),
  );
  const useDefaults = homepageSections.length === 0;
  const page = { pageStyle };

  return (
    <>
      <PageHero data={pageHero} />
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
            resolveSectionStyle(section, page, settings),
          ),
        )
      )}
    </>
  );
}
