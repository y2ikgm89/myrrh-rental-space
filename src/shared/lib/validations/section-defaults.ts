/**
 * セクション デフォルト設定・ゲッター・パーサー
 *
 * section.ts から分離。デフォルト値・config ゲッター・getSafeConfig を提供。
 */

import { z } from "zod";
import { SectionType } from "@/shared/db/enums";
import {
  sectionConfigSchemas,
  heroConfigSchema,
  heroParallaxConfigSchema,
  customConfigSchema,
  conceptConfigSchema,
  spaceListConfigSchema,
  spaceShowcaseConfigSchema,
  newsListConfigSchema,
  postListConfigSchema,
  faqListConfigSchema,
  featuresConfigSchema,
  testimonialConfigSchema,
  galleryConfigSchema,
  ctaConfigSchema,
  contactFormConfigSchema,
  mapConfigSchema,
  embedConfigSchema,
  instagramConfigSchema,
  type SectionConfig,
  type HeroConfig,
  type HeroParallaxConfig,
  type CustomConfig,
  type ConceptConfig,
  type SpaceListConfig,
  type SpaceShowcaseConfig,
  type NewsListConfig,
  type PostListConfig,
  type FaqListConfig,
  type FeaturesConfig,
  type TestimonialConfig,
  type GalleryConfig,
  type CtaConfig,
  type ContactFormConfig,
  type MapConfig,
  type EmbedConfig,
  type InstagramConfig,
} from "./section";

// =============================================================================
// 型
// =============================================================================

type SectionConfigSchemas = typeof sectionConfigSchemas;

// =============================================================================
// パーサーファクトリ
// =============================================================================

function createSectionConfigParser<TSchema extends z.ZodType>(
  schema: TSchema,
  fallback: z.output<TSchema>,
) {
  return (config: unknown): z.output<TSchema> => {
    const result = schema.safeParse(config);
    return result.success ? result.data : fallback;
  };
}

// =============================================================================
// デフォルト設定
// =============================================================================

export const defaultSectionConfigs: {
  [K in SectionType]: z.infer<SectionConfigSchemas[K]>;
} = {
  [SectionType.HERO]: {
    title: "",
    subtitle: "",
    backgroundImageUrl: "",
    buttons: [],
    height: "md",
    overlay: true,
    overlayOpacity: 40,
    variant: "default",
    parallaxSpeed: 0.5,
  },
  [SectionType.HERO_PARALLAX]: {
    tagline: "Luxury Rental Space",
    title: "洗練された空間で 特別なひとときを",
    subtitle: "厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。",
    backgroundImageUrl: "",
    buttons: [
      {
        text: "Reserve Now",
        url: "/reservation",
        variant: "primary",
        size: "lg",
        openInNewTab: false,
      },
    ],
    parallaxSpeed: 0.3,
    overlayGradient: true,
    scrollIndicator: true,
    contentPosition: "center",
    height: "full",
    overlayStyle: "gradient",
  },
  [SectionType.CUSTOM]: {
    sectionLabel: "Contents",
    maxWidth: "lg",
    containerClass: "",
    padding: "md",
  },
  [SectionType.CONCEPT]: {
    sectionLabel: "Our Philosophy",
    heading: "空間が、体験を変える",
    body: "洗練されたデザインと上質な設備が調和する空間。\nビジネスミーティングからプライベートパーティーまで、\nあらゆるシーンに最適な環境をご用意しています。",
    imageUrl: "",
    imagePosition: "right",
    textAlign: "left",
    layout: "side-by-side",
    imageAspect: "original",
  },
  [SectionType.SPACE_LIST]: {
    sectionLabel: "Spaces",
    title: "スペース一覧",
    maxItems: 6,
    showOnlyPublished: true,
    showViewAllLink: true,
    viewAllText: "全てのスペースを見る",
    viewAllUrl: "/spaces",
    layout: "grid",
    columns: 3,
    cardStyle: "bordered",
    imageAspect: "4:3",
  },
  [SectionType.SPACE_SHOWCASE]: {
    sectionLabel: "Spaces",
    title: "Our Spaces",
    maxItems: 3,
    showOnlyPublished: true,
    columns: 3,
    cardStyle: "bordered",
    imageAspect: "4:3",
  },
  [SectionType.NEWS_LIST]: {
    sectionLabel: "News",
    title: "お知らせ",
    maxItems: 5,
    showViewAllLink: true,
    viewAllText: "全てのお知らせ",
    viewAllUrl: "/news",
    layout: "list",
    columns: 2,
  },
  [SectionType.POST_LIST]: {
    sectionLabel: "Blog",
    title: "最新の記事",
    maxItems: 6,
    showViewAllLink: true,
    viewAllText: "全ての記事",
    viewAllUrl: "/posts",
    layout: "grid",
    columns: 3,
    imageAspect: "16:9",
  },
  [SectionType.FAQ_LIST]: {
    sectionLabel: "FAQ",
    title: "よくあるご質問",
    maxItems: 10,
    showViewAllLink: true,
    viewAllText: "全てのFAQ",
    viewAllUrl: "/faq",
    variant: "default",
    containerWidth: "md",
    initialOpen: "none",
  },
  [SectionType.FEATURES]: {
    sectionLabel: "Features",
    title: "Features",
    items: [],
    columns: 3,
    layout: "hero-first",
  },
  [SectionType.TESTIMONIAL]: {
    sectionLabel: "Testimonials",
    title: "お客様の声",
    items: [],
    layout: "carousel",
    showRating: true,
    variant: "default",
  },
  [SectionType.GALLERY]: {
    sectionLabel: "Gallery",
    images: [],
    layout: "grid",
    columns: 3,
    gap: "md",
    enableLightbox: true,
    imageAspect: "original",
    hoverEffect: "zoom",
  },
  [SectionType.CTA]: {
    sectionLabel: "Ready to Begin?",
    title: "ご予約・お問い合わせ",
    buttons: [
      {
        text: "予約する",
        url: "/reservation",
        variant: "primary",
        size: "lg",
        openInNewTab: false,
      },
      {
        text: "お問い合わせ",
        url: "/contact",
        variant: "secondary",
        size: "lg",
        openInNewTab: false,
      },
    ],
    variant: "default",
  },
  [SectionType.CONTACT_FORM]: {
    sectionLabel: "Contact",
    title: "お問い合わせ",
    showNameField: true,
    showPhoneField: true,
    showSubjectField: true,
    submitButtonText: "送信する",
    variant: "default",
  },
  [SectionType.MAP]: {
    sectionLabel: "Location",
    zoom: 15,
    height: "md",
    showAddressBelow: true,
    borderRadius: "sm",
  },
  [SectionType.EMBED]: {
    sectionLabel: "Media",
    aspectRatio: "16:9",
    maxWidth: "lg",
    borderRadius: "sm",
  },
  [SectionType.INSTAGRAM]: {
    sectionLabel: "Follow Us",
    title: "Instagram",
    columns: 6,
    count: 6,
    gap: "md",
  },
};

// =============================================================================
// 型特化 config ゲッター
// =============================================================================

function createSectionConfigGetter<T extends SectionType>(
  type: T,
  schema: z.ZodType<z.infer<SectionConfigSchemas[T]>>,
) {
  return (config: unknown): z.infer<SectionConfigSchemas[T]> => {
    const result = schema.safeParse(config);
    return result.success ? result.data : defaultSectionConfigs[type];
  };
}

export const getHeroConfig = createSectionConfigGetter(
  SectionType.HERO,
  heroConfigSchema,
);
export const getHeroParallaxConfig = createSectionConfigGetter(
  SectionType.HERO_PARALLAX,
  heroParallaxConfigSchema,
);
export const getCustomConfig = createSectionConfigGetter(
  SectionType.CUSTOM,
  customConfigSchema,
);
export const getConceptConfig = createSectionConfigGetter(
  SectionType.CONCEPT,
  conceptConfigSchema,
);
export const getSpaceListConfig = createSectionConfigGetter(
  SectionType.SPACE_LIST,
  spaceListConfigSchema,
);
export const getSpaceShowcaseConfig = createSectionConfigGetter(
  SectionType.SPACE_SHOWCASE,
  spaceShowcaseConfigSchema,
);
export const getNewsListConfig = createSectionConfigGetter(
  SectionType.NEWS_LIST,
  newsListConfigSchema,
);
export const getPostListConfig = createSectionConfigGetter(
  SectionType.POST_LIST,
  postListConfigSchema,
);
export const getFaqListConfig = createSectionConfigGetter(
  SectionType.FAQ_LIST,
  faqListConfigSchema,
);
export const getFeaturesConfig = createSectionConfigGetter(
  SectionType.FEATURES,
  featuresConfigSchema,
);
export const getTestimonialConfig = createSectionConfigGetter(
  SectionType.TESTIMONIAL,
  testimonialConfigSchema,
);
export const getGalleryConfig = createSectionConfigGetter(
  SectionType.GALLERY,
  galleryConfigSchema,
);
export const getCtaConfig = createSectionConfigGetter(
  SectionType.CTA,
  ctaConfigSchema,
);
export const getContactFormConfig = createSectionConfigGetter(
  SectionType.CONTACT_FORM,
  contactFormConfigSchema,
);
export const getMapConfig = createSectionConfigGetter(
  SectionType.MAP,
  mapConfigSchema,
);
export const getEmbedConfig = createSectionConfigGetter(
  SectionType.EMBED,
  embedConfigSchema,
);
export const getInstagramConfig = createSectionConfigGetter(
  SectionType.INSTAGRAM,
  instagramConfigSchema,
);

// =============================================================================
// パーサーマップ
// =============================================================================

const sectionConfigParsers = {
  [SectionType.HERO]: createSectionConfigParser(
    heroConfigSchema,
    defaultSectionConfigs[SectionType.HERO],
  ),
  [SectionType.HERO_PARALLAX]: createSectionConfigParser(
    heroParallaxConfigSchema,
    defaultSectionConfigs[SectionType.HERO_PARALLAX],
  ),
  [SectionType.CUSTOM]: createSectionConfigParser(
    customConfigSchema,
    defaultSectionConfigs[SectionType.CUSTOM],
  ),
  [SectionType.CONCEPT]: createSectionConfigParser(
    conceptConfigSchema,
    defaultSectionConfigs[SectionType.CONCEPT],
  ),
  [SectionType.SPACE_LIST]: createSectionConfigParser(
    spaceListConfigSchema,
    defaultSectionConfigs[SectionType.SPACE_LIST],
  ),
  [SectionType.SPACE_SHOWCASE]: createSectionConfigParser(
    spaceShowcaseConfigSchema,
    defaultSectionConfigs[SectionType.SPACE_SHOWCASE],
  ),
  [SectionType.NEWS_LIST]: createSectionConfigParser(
    newsListConfigSchema,
    defaultSectionConfigs[SectionType.NEWS_LIST],
  ),
  [SectionType.POST_LIST]: createSectionConfigParser(
    postListConfigSchema,
    defaultSectionConfigs[SectionType.POST_LIST],
  ),
  [SectionType.FAQ_LIST]: createSectionConfigParser(
    faqListConfigSchema,
    defaultSectionConfigs[SectionType.FAQ_LIST],
  ),
  [SectionType.FEATURES]: createSectionConfigParser(
    featuresConfigSchema,
    defaultSectionConfigs[SectionType.FEATURES],
  ),
  [SectionType.TESTIMONIAL]: createSectionConfigParser(
    testimonialConfigSchema,
    defaultSectionConfigs[SectionType.TESTIMONIAL],
  ),
  [SectionType.GALLERY]: createSectionConfigParser(
    galleryConfigSchema,
    defaultSectionConfigs[SectionType.GALLERY],
  ),
  [SectionType.CTA]: createSectionConfigParser(
    ctaConfigSchema,
    defaultSectionConfigs[SectionType.CTA],
  ),
  [SectionType.CONTACT_FORM]: createSectionConfigParser(
    contactFormConfigSchema,
    defaultSectionConfigs[SectionType.CONTACT_FORM],
  ),
  [SectionType.MAP]: createSectionConfigParser(
    mapConfigSchema,
    defaultSectionConfigs[SectionType.MAP],
  ),
  [SectionType.EMBED]: createSectionConfigParser(
    embedConfigSchema,
    defaultSectionConfigs[SectionType.EMBED],
  ),
  [SectionType.INSTAGRAM]: createSectionConfigParser(
    instagramConfigSchema,
    defaultSectionConfigs[SectionType.INSTAGRAM],
  ),
} satisfies {
  [K in SectionType]: (config: unknown) => z.output<SectionConfigSchemas[K]>;
};

// =============================================================================
// getSafeConfig — 汎用: セクションタイプに応じた config 取得（型安全）
// =============================================================================

export function getSafeConfig(
  type: typeof SectionType.HERO,
  config: unknown,
): HeroConfig;
export function getSafeConfig(
  type: typeof SectionType.HERO_PARALLAX,
  config: unknown,
): HeroParallaxConfig;
export function getSafeConfig(
  type: typeof SectionType.CUSTOM,
  config: unknown,
): CustomConfig;
export function getSafeConfig(
  type: typeof SectionType.CONCEPT,
  config: unknown,
): ConceptConfig;
export function getSafeConfig(
  type: typeof SectionType.SPACE_LIST,
  config: unknown,
): SpaceListConfig;
export function getSafeConfig(
  type: typeof SectionType.SPACE_SHOWCASE,
  config: unknown,
): SpaceShowcaseConfig;
export function getSafeConfig(
  type: typeof SectionType.NEWS_LIST,
  config: unknown,
): NewsListConfig;
export function getSafeConfig(
  type: typeof SectionType.POST_LIST,
  config: unknown,
): PostListConfig;
export function getSafeConfig(
  type: typeof SectionType.FAQ_LIST,
  config: unknown,
): FaqListConfig;
export function getSafeConfig(
  type: typeof SectionType.FEATURES,
  config: unknown,
): FeaturesConfig;
export function getSafeConfig(
  type: typeof SectionType.TESTIMONIAL,
  config: unknown,
): TestimonialConfig;
export function getSafeConfig(
  type: typeof SectionType.GALLERY,
  config: unknown,
): GalleryConfig;
export function getSafeConfig(
  type: typeof SectionType.CTA,
  config: unknown,
): CtaConfig;
export function getSafeConfig(
  type: typeof SectionType.CONTACT_FORM,
  config: unknown,
): ContactFormConfig;
export function getSafeConfig(
  type: typeof SectionType.MAP,
  config: unknown,
): MapConfig;
export function getSafeConfig(
  type: typeof SectionType.EMBED,
  config: unknown,
): EmbedConfig;
export function getSafeConfig(
  type: typeof SectionType.INSTAGRAM,
  config: unknown,
): InstagramConfig;
export function getSafeConfig(
  type: SectionType,
  config: unknown,
): SectionConfig {
  switch (type) {
    case SectionType.HERO:
      return sectionConfigParsers[SectionType.HERO](config);
    case SectionType.HERO_PARALLAX:
      return sectionConfigParsers[SectionType.HERO_PARALLAX](config);
    case SectionType.CUSTOM:
      return sectionConfigParsers[SectionType.CUSTOM](config);
    case SectionType.CONCEPT:
      return sectionConfigParsers[SectionType.CONCEPT](config);
    case SectionType.SPACE_LIST:
      return sectionConfigParsers[SectionType.SPACE_LIST](config);
    case SectionType.SPACE_SHOWCASE:
      return sectionConfigParsers[SectionType.SPACE_SHOWCASE](config);
    case SectionType.NEWS_LIST:
      return sectionConfigParsers[SectionType.NEWS_LIST](config);
    case SectionType.POST_LIST:
      return sectionConfigParsers[SectionType.POST_LIST](config);
    case SectionType.FAQ_LIST:
      return sectionConfigParsers[SectionType.FAQ_LIST](config);
    case SectionType.FEATURES:
      return sectionConfigParsers[SectionType.FEATURES](config);
    case SectionType.TESTIMONIAL:
      return sectionConfigParsers[SectionType.TESTIMONIAL](config);
    case SectionType.GALLERY:
      return sectionConfigParsers[SectionType.GALLERY](config);
    case SectionType.CTA:
      return sectionConfigParsers[SectionType.CTA](config);
    case SectionType.CONTACT_FORM:
      return sectionConfigParsers[SectionType.CONTACT_FORM](config);
    case SectionType.MAP:
      return sectionConfigParsers[SectionType.MAP](config);
    case SectionType.EMBED:
      return sectionConfigParsers[SectionType.EMBED](config);
    case SectionType.INSTAGRAM:
      return sectionConfigParsers[SectionType.INSTAGRAM](config);
  }
}
