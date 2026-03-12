/**
 * 統一セクション バリデーションスキーマ
 *
 * 各セクションのスキーマは definition.ts / config.ts に定義。
 * このファイルはそれらを集約し、CRUD スキーマ・デフォルト設定・
 * パーサー関数を提供する。
 */

import { z } from "zod";
import {
  imageAspectValues,
  cardStyleValues,
  borderRadiusValues,
  containerWidthValues,
  gapSizeValues,
  contentPositionValues,
  overlayStyleValues,
  heroParallaxHeightValues,
  featuresLayoutValues,
  faqInitialOpenValues,
  galleryHoverEffectValues,
  conceptLayoutValues,
  heroHeightValues,
  heroVariantValues,
  paddingValues,
  imagePositionValues,
  textAlignValues,
  spaceLayoutValues,
  newsLayoutValues,
  postLayoutValues,
  ctaVariantValues,
  testimonialLayoutValues,
  testimonialVariantValues,
  galleryLayoutValues,
  galleryGapValues,
  contactFormVariantValues,
  faqVariantValues,
  mapHeightValues,
  embedAspectRatioValues,
  spaceImageAspectValues,
  showcaseImageAspectValues,
  postImageAspectValues,
  galleryImageAspectValues,
  maxWidthValues,
  type ImageAspect,
} from "./section-options";

// ---------------------------------------------------------------------------
// Config スキーマのインポート（definition.ts / config.ts）
// ---------------------------------------------------------------------------

// 12 non-list sections: definition.ts から
import { heroConfigSchema } from "@/public/components/sections/standard/hero/definition";
import { heroParallaxConfigSchema } from "@/public/components/sections/standard/hero-parallax/definition";
import { customConfigSchema } from "@/public/components/sections/standard/custom/definition";
import { conceptConfigSchema } from "@/public/components/sections/standard/concept/definition";
import { featuresConfigSchema } from "@/public/components/sections/standard/features/definition";
import { testimonialConfigSchema } from "@/public/components/sections/standard/testimonial/definition";
import { galleryConfigSchema } from "@/public/components/sections/standard/gallery/definition";
import { ctaConfigSchema } from "@/public/components/sections/standard/cta/definition";
import { contactFormConfigSchema } from "@/public/components/sections/standard/contact-form/definition";
import { mapConfigSchema } from "@/public/components/sections/standard/map/definition";
import { embedConfigSchema } from "@/public/components/sections/standard/embed/definition";
import { instagramConfigSchema } from "@/public/components/sections/standard/instagram/definition";

// 5 list sections: config.ts から（definition.ts は server-only dataLoader を含む）
import { spaceListConfigSchema } from "@/public/components/sections/standard/space-list/config";
import { spaceShowcaseConfigSchema } from "@/public/components/sections/standard/space-showcase/config";
import { newsListConfigSchema } from "@/public/components/sections/standard/news-list/config";
import { postListConfigSchema } from "@/public/components/sections/standard/post-list/config";
import { faqListConfigSchema } from "@/public/components/sections/standard/faq-list/config";

// Re-export all config schemas
export {
  heroConfigSchema,
  heroParallaxConfigSchema,
  customConfigSchema,
  conceptConfigSchema,
  featuresConfigSchema,
  testimonialConfigSchema,
  galleryConfigSchema,
  ctaConfigSchema,
  contactFormConfigSchema,
  mapConfigSchema,
  embedConfigSchema,
  instagramConfigSchema,
  spaceListConfigSchema,
  spaceShowcaseConfigSchema,
  newsListConfigSchema,
  postListConfigSchema,
  faqListConfigSchema,
};

// ---------------------------------------------------------------------------
// Re-exports from section-design
// ---------------------------------------------------------------------------

export type {
  CTAButtonItem,
  SectionDesign,
  SectionDesignInput,
  TitleSize,
  TextAlign,
} from "./section-design";
export {
  ctaButtonVariants,
  ctaButtonSizes,
  sectionDesignSchema,
  defaultSectionDesign,
  parseSectionDesign,
  titleSizeValues,
  isTitleSize,
  isSectionAnimation,
} from "./section-design";

// =============================================================================
// 統合スキーママップ
// =============================================================================

/**
 * componentId → config スキーマのマッピング
 */
export const sectionConfigSchemas: Record<string, z.ZodType> = {
  "hero": heroConfigSchema,
  "hero-parallax": heroParallaxConfigSchema,
  "custom": customConfigSchema,
  "concept": conceptConfigSchema,
  "space-list": spaceListConfigSchema,
  "space-showcase": spaceShowcaseConfigSchema,
  "news-list": newsListConfigSchema,
  "post-list": postListConfigSchema,
  "faq-list": faqListConfigSchema,
  "features": featuresConfigSchema,
  "testimonial": testimonialConfigSchema,
  "gallery": galleryConfigSchema,
  "cta": ctaConfigSchema,
  "contact-form": contactFormConfigSchema,
  "map": mapConfigSchema,
  "embed": embedConfigSchema,
  "instagram": instagramConfigSchema,
};

/**
 * componentId に応じた config を検証
 */
export function validateSectionConfig(
  componentId: string,
  config: unknown,
): z.ZodSafeParseResult<unknown> {
  const schema = sectionConfigSchemas[componentId];
  if (!schema) {
    return { success: false, error: new z.ZodError([]) };
  }
  return schema.safeParse(config);
}

/**
 * componentId に応じた config をパースし、失敗時はデフォルト値を返す
 */
export function parseSectionConfig(
  componentId: string,
  config: unknown,
): unknown {
  const schema = sectionConfigSchemas[componentId];
  if (!schema) return config;
  const result = schema.safeParse(config);
  if (result.success) return result.data;
  const defaultConfig = defaultSectionConfigMap[componentId];
  return defaultConfig ?? config;
}

// =============================================================================
// CRUD スキーマ
// =============================================================================

/** セクション作成スキーマ */
export const createSectionSchema = z.object({
  pageId: z.string().uuid().optional(), // null = ホームページ
  componentId: z.string().min(1, { error: "コンポーネントIDは必須です" }),
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  design: z.record(z.string(), z.unknown()).default({}),
  contentJson: z
    .string()
    .max(500000, { error: "コンテンツは500,000文字以内です" })
    .optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

/** セクション更新スキーマ */
export const updateSectionSchema = z.object({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  design: z.record(z.string(), z.unknown()).optional(),
  contentJson: z
    .string()
    .max(500000, { error: "コンテンツは500,000文字以内です" })
    .optional(),
  isActive: z.boolean().optional(),
});

/** セクション順序更新スキーマ */
export const updateSectionOrderSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0),
    }),
  ),
});

// =============================================================================
// 型エクスポート
// =============================================================================

// Output types（バリデーション後）
export type HeroConfig = z.output<typeof heroConfigSchema>;
export type HeroParallaxConfig = z.output<typeof heroParallaxConfigSchema>;
export type CustomConfig = z.output<typeof customConfigSchema>;
export type ConceptConfig = z.output<typeof conceptConfigSchema>;
export type SpaceListConfig = z.output<typeof spaceListConfigSchema>;
export type SpaceShowcaseConfig = z.output<typeof spaceShowcaseConfigSchema>;
export type NewsListConfig = z.output<typeof newsListConfigSchema>;
export type PostListConfig = z.output<typeof postListConfigSchema>;
export type FaqListConfig = z.output<typeof faqListConfigSchema>;
export type FeaturesConfig = z.output<typeof featuresConfigSchema>;
export type TestimonialConfig = z.output<typeof testimonialConfigSchema>;
export type GalleryConfig = z.output<typeof galleryConfigSchema>;
export type CtaConfig = z.output<typeof ctaConfigSchema>;
export type ContactFormConfig = z.output<typeof contactFormConfigSchema>;
export type MapConfig = z.output<typeof mapConfigSchema>;
export type EmbedConfig = z.output<typeof embedConfigSchema>;
export type InstagramConfig = z.output<typeof instagramConfigSchema>;

// Input types（フォーム入力用）
export type HeroConfigInput = z.input<typeof heroConfigSchema>;
export type HeroParallaxConfigInput = z.input<typeof heroParallaxConfigSchema>;
export type CustomConfigInput = z.input<typeof customConfigSchema>;
export type ConceptConfigInput = z.input<typeof conceptConfigSchema>;
export type SpaceListConfigInput = z.input<typeof spaceListConfigSchema>;
export type SpaceShowcaseConfigInput = z.input<
  typeof spaceShowcaseConfigSchema
>;
export type NewsListConfigInput = z.input<typeof newsListConfigSchema>;
export type PostListConfigInput = z.input<typeof postListConfigSchema>;
export type FaqListConfigInput = z.input<typeof faqListConfigSchema>;
export type FeaturesConfigInput = z.input<typeof featuresConfigSchema>;
export type TestimonialConfigInput = z.input<typeof testimonialConfigSchema>;
export type GalleryConfigInput = z.input<typeof galleryConfigSchema>;
export type CtaConfigInput = z.input<typeof ctaConfigSchema>;
export type ContactFormConfigInput = z.input<typeof contactFormConfigSchema>;
export type MapConfigInput = z.input<typeof mapConfigSchema>;
export type EmbedConfigInput = z.input<typeof embedConfigSchema>;
export type InstagramConfigInput = z.input<typeof instagramConfigSchema>;

export type SectionConfig =
  | HeroConfig
  | HeroParallaxConfig
  | CustomConfig
  | ConceptConfig
  | SpaceListConfig
  | SpaceShowcaseConfig
  | NewsListConfig
  | PostListConfig
  | FaqListConfig
  | FeaturesConfig
  | TestimonialConfig
  | GalleryConfig
  | CtaConfig
  | ContactFormConfig
  | MapConfig
  | EmbedConfig
  | InstagramConfig;

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type UpdateSectionOrderInput = z.infer<typeof updateSectionOrderSchema>;

// =============================================================================
// デフォルト設定（スキーマの .parse() から自動生成）
// =============================================================================

export const defaultSectionConfigs = {
  "hero": heroConfigSchema.parse({}),
  "hero-parallax": heroParallaxConfigSchema.parse({}),
  "custom": customConfigSchema.parse({}),
  "concept": conceptConfigSchema.parse({}),
  "space-list": spaceListConfigSchema.parse({}),
  "space-showcase": spaceShowcaseConfigSchema.parse({}),
  "news-list": newsListConfigSchema.parse({}),
  "post-list": postListConfigSchema.parse({}),
  "faq-list": faqListConfigSchema.parse({}),
  "features": featuresConfigSchema.parse({}),
  "testimonial": testimonialConfigSchema.parse({}),
  "gallery": galleryConfigSchema.parse({}),
  "cta": ctaConfigSchema.parse({ title: "ご予約はこちら" }),
  "contact-form": contactFormConfigSchema.parse({}),
  "map": mapConfigSchema.parse({}),
  "embed": embedConfigSchema.parse({}),
  "instagram": instagramConfigSchema.parse({}),
} satisfies Record<string, SectionConfig>;

/**
 * string インデックスアクセス用のマップ（defaultSectionConfigs は satisfies で具体型を保持するため
 * 変数インデックス `defaultSectionConfigs[key]` が使えない — こちらを使う）
 */
export const defaultSectionConfigMap: Record<string, SectionConfig> =
  defaultSectionConfigs;

// =============================================================================
// 型特化 config パーサー
// =============================================================================

const heroHeightSchema = z.enum(heroHeightValues);
const maxWidthOptionsSchema = z.enum(maxWidthValues);
const paddingOptionsSchema = z.enum(paddingValues);
const spaceLayoutOptionsSchema = z.enum(spaceLayoutValues);
const newsLayoutOptionsSchema = z.enum(newsLayoutValues);
const postLayoutOptionsSchema = z.enum(postLayoutValues);
const ctaVariantOptionsSchema = z.enum(ctaVariantValues);
const galleryLayoutOptionsSchema = z.enum(galleryLayoutValues);
const galleryGapOptionsSchema = z.enum(galleryGapValues);
const testimonialLayoutOptionsSchema = z.enum(testimonialLayoutValues);
const testimonialVariantOptionsSchema = z.enum(testimonialVariantValues);
const mapHeightOptionsSchema = z.enum(mapHeightValues);
const embedAspectRatioOptionsSchema = z.enum(embedAspectRatioValues);

export function parseHeroHeight(value: string): HeroConfig["height"] {
  const result = heroHeightSchema.safeParse(value);
  return result.success ? result.data : "md";
}

export function parseMaxWidth(value: string): CustomConfig["maxWidth"] {
  const result = maxWidthOptionsSchema.safeParse(value);
  return result.success ? result.data : "lg";
}

export function parsePadding(value: string): CustomConfig["padding"] {
  const result = paddingOptionsSchema.safeParse(value);
  return result.success ? result.data : "md";
}

export function parseSpaceLayout(value: string): SpaceListConfig["layout"] {
  const result = spaceLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "grid";
}

export function parseNewsLayout(value: string): NewsListConfig["layout"] {
  const result = newsLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "list";
}

export function parsePostLayout(value: string): PostListConfig["layout"] {
  const result = postLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "grid";
}

export function parseCtaVariant(value: string): CtaConfig["variant"] {
  const result = ctaVariantOptionsSchema.safeParse(value);
  return result.success ? result.data : "default";
}

export function parseGalleryLayout(value: string): GalleryConfig["layout"] {
  const result = galleryLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "grid";
}

export function parseGalleryGap(value: string): GalleryConfig["gap"] {
  const result = galleryGapOptionsSchema.safeParse(value);
  return result.success ? result.data : "md";
}

export function parseTestimonialLayout(
  value: string,
): TestimonialConfig["layout"] {
  const result = testimonialLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "carousel";
}

export function parseTestimonialVariant(
  value: string,
): TestimonialConfig["variant"] {
  const result = testimonialVariantOptionsSchema.safeParse(value);
  return result.success ? result.data : "default";
}

export function parseMapHeight(value: string): MapConfig["height"] {
  const result = mapHeightOptionsSchema.safeParse(value);
  return result.success ? result.data : "md";
}

export function parseEmbedAspectRatio(
  value: string,
): EmbedConfig["aspectRatio"] {
  const result = embedAspectRatioOptionsSchema.safeParse(value);
  return result.success ? result.data : "16:9";
}

// --- Phase: variant/layout 拡張用パーサー ---

const cardStyleOptionsSchema = z.enum(cardStyleValues);
const borderRadiusOptionsSchema = z.enum(borderRadiusValues);
const containerWidthOptionsSchema = z.enum(containerWidthValues);
const gapSizeOptionsSchema = z.enum(gapSizeValues);
const contentPositionOptionsSchema = z.enum(contentPositionValues);
const overlayStyleOptionsSchema = z.enum(overlayStyleValues);
const heroParallaxHeightOptionsSchema = z.enum(heroParallaxHeightValues);
const featuresLayoutOptionsSchema = z.enum(featuresLayoutValues);
const faqInitialOpenOptionsSchema = z.enum(faqInitialOpenValues);
const galleryHoverEffectOptionsSchema = z.enum(galleryHoverEffectValues);
const conceptLayoutOptionsSchema = z.enum(conceptLayoutValues);
const imageAspectOptionsSchema = z.enum(imageAspectValues);
const heroVariantOptionsSchema = z.enum(heroVariantValues);
const contactFormVariantOptionsSchema = z.enum(contactFormVariantValues);
const faqVariantOptionsSchema = z.enum(faqVariantValues);

export function parseCardStyle(value: string): SpaceListConfig["cardStyle"] {
  const result = cardStyleOptionsSchema.safeParse(value);
  return result.success ? result.data : "bordered";
}

export function parseBorderRadius(value: string): MapConfig["borderRadius"] {
  const result = borderRadiusOptionsSchema.safeParse(value);
  return result.success ? result.data : "sm";
}

export function parseContainerWidth(
  value: string,
): FaqListConfig["containerWidth"] {
  const result = containerWidthOptionsSchema.safeParse(value);
  return result.success ? result.data : "md";
}

export function parseGapSize(value: string): InstagramConfig["gap"] {
  const result = gapSizeOptionsSchema.safeParse(value);
  return result.success ? result.data : "md";
}

export function parseContentPosition(
  value: string,
): HeroParallaxConfig["contentPosition"] {
  const result = contentPositionOptionsSchema.safeParse(value);
  return result.success ? result.data : "center";
}

export function parseOverlayStyle(
  value: string,
): HeroParallaxConfig["overlayStyle"] {
  const result = overlayStyleOptionsSchema.safeParse(value);
  return result.success ? result.data : "gradient";
}

export function parseHeroParallaxHeight(
  value: string,
): HeroParallaxConfig["height"] {
  const result = heroParallaxHeightOptionsSchema.safeParse(value);
  return result.success ? result.data : "full";
}

export function parseFeaturesLayout(value: string): FeaturesConfig["layout"] {
  const result = featuresLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "hero-first";
}

export function parseFaqInitialOpen(
  value: string,
): FaqListConfig["initialOpen"] {
  const result = faqInitialOpenOptionsSchema.safeParse(value);
  return result.success ? result.data : "none";
}

export function parseGalleryHoverEffect(
  value: string,
): GalleryConfig["hoverEffect"] {
  const result = galleryHoverEffectOptionsSchema.safeParse(value);
  return result.success ? result.data : "zoom";
}

export function parseConceptLayout(value: string): ConceptConfig["layout"] {
  const result = conceptLayoutOptionsSchema.safeParse(value);
  return result.success ? result.data : "side-by-side";
}

export function parseImageAspect(value: string): ImageAspect {
  const result = imageAspectOptionsSchema.safeParse(value);
  return result.success ? result.data : "original";
}

const spaceImageAspectSchema = z.enum(spaceImageAspectValues);

export function parseSpaceImageAspect(
  value: string,
): SpaceListConfig["imageAspect"] {
  const result = spaceImageAspectSchema.safeParse(value);
  return result.success ? result.data : "4:3";
}

const postImageAspectSchema = z.enum(postImageAspectValues);

export function parsePostImageAspect(
  value: string,
): PostListConfig["imageAspect"] {
  const result = postImageAspectSchema.safeParse(value);
  return result.success ? result.data : "16:9";
}

const galleryImageAspectSchema = z.enum(galleryImageAspectValues);

export function parseGalleryImageAspect(
  value: string,
): GalleryConfig["imageAspect"] {
  const result = galleryImageAspectSchema.safeParse(value);
  return result.success ? result.data : "original";
}

const showcaseImageAspectSchema = z.enum(showcaseImageAspectValues);

export function parseShowcaseImageAspect(
  value: string,
): SpaceShowcaseConfig["imageAspect"] {
  const result = showcaseImageAspectSchema.safeParse(value);
  return result.success ? result.data : "4:3";
}

export function parseHeroVariant(value: string): HeroConfig["variant"] {
  const result = heroVariantOptionsSchema.safeParse(value);
  return result.success ? result.data : "default";
}

export function parseContactFormVariant(
  value: string,
): ContactFormConfig["variant"] {
  const result = contactFormVariantOptionsSchema.safeParse(value);
  return result.success ? result.data : "default";
}

export function parseFaqVariant(value: string): FaqListConfig["variant"] {
  const result = faqVariantOptionsSchema.safeParse(value);
  return result.success ? result.data : "default";
}

const imagePositionOptionsSchema = z.enum(imagePositionValues);

export function parseImagePosition(
  value: string,
): ConceptConfig["imagePosition"] {
  const result = imagePositionOptionsSchema.safeParse(value);
  return result.success ? result.data : "right";
}

const textAlignOptionsSchema = z.enum(textAlignValues);

export function parseTextAlign(value: string): ConceptConfig["textAlign"] {
  const result = textAlignOptionsSchema.safeParse(value);
  return result.success ? result.data : "left";
}

// =============================================================================
// 表示名
// =============================================================================

export const sectionComponentLabels: Record<string, string> = {
  "hero": "ヒーロー",
  "hero-parallax": "パララックスヒーロー",
  "custom": "カスタム",
  "concept": "コンセプト",
  "space-list": "スペース一覧",
  "space-showcase": "スペースショーケース",
  "news-list": "お知らせ一覧",
  "post-list": "記事一覧",
  "faq-list": "よくあるご質問",
  "features": "特徴",
  "testimonial": "体験談・レビュー",
  "gallery": "ギャラリー",
  "cta": "CTA（行動喚起）",
  "contact-form": "お問い合わせフォーム",
  "map": "地図",
  "embed": "埋め込み",
  "instagram": "Instagram",
};

/** @deprecated Use sectionComponentLabels instead */
export const sectionTypeLabels: Record<string, string> = sectionComponentLabels;

/** ホームページセクションのデフォルト順序 */
export const defaultHomepageSectionOrder: string[] = [
  "hero-parallax",
  "concept",
  "space-showcase",
  "features",
  "cta",
];
