import type { ReactElement } from "react";
import { PageHero } from "@/public/components/page-hero/PageHero";
import { getShowcaseSpaces } from "@/shared/domain/sections/queries";
import {
  getDefaultSectionStyle,
  type SectionStylePayload,
} from "@/shared/domain/section-styles/types";
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
import { isAppRoute } from "@/shared/lib/typed-routes";
import type { CTAButtonItem } from "@/shared/lib/validations/cta-and-url";

type HomepageRenderableSection = {
  readonly id: string;
  readonly type: string;
  readonly config: unknown;
};

interface HomepageSectionsProps {
  readonly sections: readonly HomepageRenderableSection[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function str(config: unknown, key: string, fallback: string): string {
  if (!isRecord(config)) return fallback;
  const value = config[key];
  return typeof value === "string" ? value : fallback;
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

/**
 * homepage-cta config の buttons[] を type-guard で narrow 化する。
 * Runtime な safeParse を経由しないため、未知のフィールドは fallback default に倒す。
 */
function isCtaButtonRecord(value: unknown): value is {
  text?: unknown;
  url?: unknown;
  variant?: unknown;
  size?: unknown;
  iconName?: unknown;
  openInNewTab?: unknown;
  backgroundColor?: unknown;
  textColor?: unknown;
} {
  return isRecord(value);
}

function isCtaVariant(value: unknown): value is CTAButtonItem["variant"] {
  return (
    value === "primary" ||
    value === "secondary" ||
    value === "outline" ||
    value === "ghost"
  );
}

function isCtaSize(value: unknown): value is CTAButtonItem["size"] {
  return value === "sm" || value === "md" || value === "lg";
}

function parseCtaButton(value: unknown): CTAButtonItem | null {
  if (!isCtaButtonRecord(value)) return null;
  if (typeof value.text !== "string" || value.text.length === 0) return null;
  if (typeof value.url !== "string") return null;
  if (!isAppRoute(value.url)) return null;
  return {
    text: value.text,
    url: value.url,
    variant: isCtaVariant(value.variant) ? value.variant : "primary",
    size: isCtaSize(value.size) ? value.size : "lg",
    iconName: typeof value.iconName === "string" ? value.iconName : "",
    openInNewTab:
      typeof value.openInNewTab === "boolean" ? value.openInNewTab : false,
    ...(typeof value.backgroundColor === "string" &&
      value.backgroundColor.length > 0 && {
        backgroundColor: value.backgroundColor,
      }),
    ...(typeof value.textColor === "string" &&
      value.textColor.length > 0 && { textColor: value.textColor }),
  };
}

function mapCtaConfig(config: unknown): Partial<CtaSectionProps> {
  const rawButtons = arr(config, "buttons");
  const parsedButtons: CTAButtonItem[] = rawButtons
    ? rawButtons.flatMap((value) => {
        const parsed = parseCtaButton(value);
        return parsed ? [parsed] : [];
      })
    : [];

  return {
    label: str(config, "label", ctaDefaultProps.label),
    title: str(config, "title", ctaDefaultProps.title),
    description: str(config, "description", ctaDefaultProps.description),
    ...(parsedButtons.length > 0 && { buttons: parsedButtons }),
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
  sections,
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

  const pageHeroSection = sections.find(
    (section) => section.type === "page-hero",
  );
  const homepageSections = sections.filter((section) =>
    section.type.startsWith("homepage-"),
  );
  const useDefaults = homepageSections.length === 0;

  return (
    <>
      {pageHeroSection ? <PageHero config={pageHeroSection.config} /> : null}
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
            getDefaultSectionStyle(section.type),
          ),
        )
      )}
    </>
  );
}
