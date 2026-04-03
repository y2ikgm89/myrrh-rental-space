import type { Config } from "@measured/puck";
import { HomepageHero, heroDefaultProps } from "./hero-section";
import { PullQuoteSection, pullQuoteDefaultProps } from "./pullquote-section";
import { SpacesSection, spacesDefaultProps } from "./spaces-section";
import { FeaturesSection, featuresDefaultProps } from "./features-section";
import { StatsSection, statsDefaultProps } from "./stats-section";
import { CtaSection, ctaDefaultProps } from "./cta-section";

export type { HeroSectionProps } from "./hero-section";
export type { PullQuoteSectionProps } from "./pullquote-section";
export type { SpacesSectionProps } from "./spaces-section";
export type { FeaturesSectionProps, FeatureItem } from "./features-section";
export type { StatsSectionProps, StatItem } from "./stats-section";
export type { CtaSectionProps } from "./cta-section";

/**
 * Puck visual editor configuration for the homepage.
 *
 * Each component renders the same editorial section used on the public page,
 * with props made configurable via Puck's field UI.
 *
 * Note: Config is typed loosely because our component props use `readonly`
 * modifiers which are incompatible with Puck's mutable internal types.
 */
export const puckConfig: Config = {
  components: {
    HeroSection: {
      label: "ヒーロー",
      defaultProps: { ...heroDefaultProps },
      fields: {
        label: { type: "text", label: "ラベル" },
        title: { type: "text", label: "タイトル" },
        description: { type: "textarea", label: "説明文" },
        imageUrl: { type: "text", label: "画像URL" },
        imageAlt: { type: "text", label: "画像alt" },
        buttonText: { type: "text", label: "ボタンテキスト" },
        buttonUrl: { type: "text", label: "ボタンURL" },
      },
      render: ({
        label,
        title,
        description,
        imageUrl,
        imageAlt,
        buttonText,
        buttonUrl,
      }) => (
        <HomepageHero
          label={label}
          title={title}
          description={description}
          imageUrl={imageUrl}
          imageAlt={imageAlt}
          buttonText={buttonText}
          buttonUrl={buttonUrl}
        />
      ),
    },
    PullQuoteSection: {
      label: "引用",
      defaultProps: { ...pullQuoteDefaultProps },
      fields: {
        quote: { type: "textarea", label: "引用テキスト" },
        attribution: { type: "text", label: "著者名" },
      },
      render: ({ quote, attribution }) => (
        <PullQuoteSection quote={quote} attribution={attribution} />
      ),
    },
    SpacesSection: {
      label: "スペース一覧",
      defaultProps: {
        title: spacesDefaultProps.title,
        count: spacesDefaultProps.count,
      },
      fields: {
        title: { type: "text", label: "セクションタイトル" },
        count: { type: "number", label: "表示件数", min: 1, max: 12 },
      },
      render: ({ title, count }) => {
        const safeTitle =
          typeof title === "string" ? title : spacesDefaultProps.title;
        const safeCount =
          typeof count === "number" ? count : spacesDefaultProps.count;
        return (
          <SpacesSection spaces={[]} title={safeTitle} count={safeCount} />
        );
      },
    },
    FeaturesSection: {
      label: "特長",
      defaultProps: {
        title: featuresDefaultProps.title,
        items: [...featuresDefaultProps.items],
      },
      fields: {
        title: { type: "text", label: "セクションタイトル" },
        items: {
          type: "array",
          label: "特長リスト",
          arrayFields: {
            title: { type: "text", label: "タイトル" },
            description: { type: "textarea", label: "説明文" },
          },
        },
      },
      render: ({ title, items }) => (
        <FeaturesSection title={title} items={items} />
      ),
    },
    StatsSection: {
      label: "統計",
      defaultProps: {
        items: [...statsDefaultProps.items],
      },
      fields: {
        items: {
          type: "array",
          label: "統計リスト",
          arrayFields: {
            value: { type: "text", label: "数値" },
            label: { type: "text", label: "ラベル" },
          },
        },
      },
      render: ({ items }) => <StatsSection items={items} />,
    },
    CtaSection: {
      label: "CTA",
      defaultProps: { ...ctaDefaultProps },
      fields: {
        label: { type: "text", label: "ラベル" },
        title: { type: "text", label: "タイトル" },
        description: { type: "textarea", label: "説明文" },
        buttonText: { type: "text", label: "ボタンテキスト" },
        buttonUrl: { type: "text", label: "ボタンURL" },
      },
      render: ({ label, title, description, buttonText, buttonUrl }) => (
        <CtaSection
          label={label}
          title={title}
          description={description}
          buttonText={buttonText}
          buttonUrl={buttonUrl}
        />
      ),
    },
  },
};
