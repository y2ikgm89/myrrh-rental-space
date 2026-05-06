/**
 * セクション デフォルト設定・ゲッター
 *
 * レジストリ（registry.ts）へ委譲する薄いラッパー。
 * 旧 API との互換を維持しつつ、定義の正本はファイルベースレジストリに一元化する。
 */

import type {
  HeroConfig,
  HeroParallaxConfig,
  CustomConfig,
  ConceptConfig,
  SpaceListConfig,
  SpaceShowcaseConfig,
  NewsListConfig,
  PostListConfig,
  FaqListConfig,
  FeaturesConfig,
  TestimonialConfig,
  GalleryConfig,
  CtaConfig,
  ContactFormConfig,
  MapConfig,
  EmbedConfig,
  InstagramConfig,
  SectionConfig,
} from "./section";
import { validateSectionConfig } from "./section";
import type { LocationListConfig } from "@/shared/lib/sections/definitions/location-list/schema";
import { locationListConfigSchema } from "@/shared/lib/sections/definitions/location-list/schema";
import type { EventCalendarConfig } from "@/shared/lib/sections/definitions/event-calendar/schema";
import { eventCalendarConfigSchema } from "@/shared/lib/sections/definitions/event-calendar/schema";
import type { ReservationFormConfig } from "@/shared/lib/sections/definitions/reservation-form/schema";
import { reservationFormConfigSchema } from "@/shared/lib/sections/definitions/reservation-form/schema";
import type { ValuePropsConfig } from "@/shared/lib/sections/definitions/value-props/schema";
import { valuePropsConfigSchema } from "@/shared/lib/sections/definitions/value-props/schema";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero/schema";
import { pageHeroConfigSchema } from "@/shared/lib/sections/definitions/page-hero/schema";

// =============================================================================
// デフォルト設定取得（レジストリ委譲）
// =============================================================================

/** string キーで defaultConfig を安全に参照（未知のタイプは undefined） */
export function getDefaultSectionConfig(
  type: string,
): SectionConfig | undefined {
  const result = validateSectionConfig(type, {});
  if (result.success) return result.data;
  return undefined;
}

// =============================================================================
// 型特化 config ゲッター（スキーマ直接参照で as T 不要）
// =============================================================================

import type { z } from "zod";
import {
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
} from "./section";

/**
 * 具体スキーマを直接 safeParse することで、戻り値型が z.output<Schema> に推論される。
 * as T キャスト不要。
 */
function createTypedConfigGetterFromSchema<S extends z.ZodType>(schema: S) {
  return (config: unknown): z.output<S> => {
    const result = schema.safeParse(config);
    if (result.success) return result.data;
    // フォールバック: 空オブジェクトをパースしてデフォルト値を取得
    // 全セクションスキーマはフィールドにデフォルト値を持つため safeParse({}) は必ず成功する
    const fallback = schema.safeParse({});
    if (fallback.success) return fallback.data;
    // 到達不能: 全スキーマが {} からデフォルト値を生成可能
    throw new Error(`Failed to parse default config for section schema`);
  };
}

export const getHeroConfig =
  createTypedConfigGetterFromSchema(heroConfigSchema);
export const getHeroParallaxConfig = createTypedConfigGetterFromSchema(
  heroParallaxConfigSchema,
);
export const getCustomConfig =
  createTypedConfigGetterFromSchema(customConfigSchema);
export const getConceptConfig =
  createTypedConfigGetterFromSchema(conceptConfigSchema);
export const getSpaceListConfig = createTypedConfigGetterFromSchema(
  spaceListConfigSchema,
);
export const getSpaceShowcaseConfig = createTypedConfigGetterFromSchema(
  spaceShowcaseConfigSchema,
);
export const getNewsListConfig =
  createTypedConfigGetterFromSchema(newsListConfigSchema);
export const getPostListConfig =
  createTypedConfigGetterFromSchema(postListConfigSchema);
export const getFaqListConfig =
  createTypedConfigGetterFromSchema(faqListConfigSchema);
export const getFeaturesConfig =
  createTypedConfigGetterFromSchema(featuresConfigSchema);
export const getTestimonialConfig = createTypedConfigGetterFromSchema(
  testimonialConfigSchema,
);
export const getGalleryConfig =
  createTypedConfigGetterFromSchema(galleryConfigSchema);
export const getCtaConfig = createTypedConfigGetterFromSchema(ctaConfigSchema);

export const getEventCalendarConfig = createTypedConfigGetterFromSchema(
  eventCalendarConfigSchema,
);
export const getContactFormConfig = createTypedConfigGetterFromSchema(
  contactFormConfigSchema,
);
export const getMapConfig = createTypedConfigGetterFromSchema(mapConfigSchema);
export const getEmbedConfig =
  createTypedConfigGetterFromSchema(embedConfigSchema);
export const getInstagramConfig = createTypedConfigGetterFromSchema(
  instagramConfigSchema,
);
export const getLocationListConfig = createTypedConfigGetterFromSchema(
  locationListConfigSchema,
);

export const getReservationFormConfig = createTypedConfigGetterFromSchema(
  reservationFormConfigSchema,
);

export const getValuePropsConfig = createTypedConfigGetterFromSchema(
  valuePropsConfigSchema,
);

export const getPageHeroConfig =
  createTypedConfigGetterFromSchema(pageHeroConfigSchema);

// =============================================================================
// getSafeConfig — 汎用: セクションタイプに応じた config 取得（レジストリ委譲）
// =============================================================================

export function getSafeConfig(type: "hero", config: unknown): HeroConfig;
export function getSafeConfig(
  type: "hero-parallax",
  config: unknown,
): HeroParallaxConfig;
export function getSafeConfig(type: "custom", config: unknown): CustomConfig;
export function getSafeConfig(type: "concept", config: unknown): ConceptConfig;
export function getSafeConfig(
  type: "space-list",
  config: unknown,
): SpaceListConfig;
export function getSafeConfig(
  type: "space-showcase",
  config: unknown,
): SpaceShowcaseConfig;
export function getSafeConfig(
  type: "news-list",
  config: unknown,
): NewsListConfig;
export function getSafeConfig(
  type: "post-list",
  config: unknown,
): PostListConfig;
export function getSafeConfig(type: "faq-list", config: unknown): FaqListConfig;
export function getSafeConfig(
  type: "features",
  config: unknown,
): FeaturesConfig;
export function getSafeConfig(
  type: "testimonial",
  config: unknown,
): TestimonialConfig;
export function getSafeConfig(type: "gallery", config: unknown): GalleryConfig;
export function getSafeConfig(type: "cta", config: unknown): CtaConfig;
export function getSafeConfig(
  type: "contact-form",
  config: unknown,
): ContactFormConfig;
export function getSafeConfig(type: "map", config: unknown): MapConfig;
export function getSafeConfig(type: "embed", config: unknown): EmbedConfig;
export function getSafeConfig(
  type: "instagram",
  config: unknown,
): InstagramConfig;
export function getSafeConfig(
  type: "location-list",
  config: unknown,
): LocationListConfig;
export function getSafeConfig(
  type: "event-calendar",
  config: unknown,
): EventCalendarConfig;
export function getSafeConfig(
  type: "reservation-form",
  config: unknown,
): ReservationFormConfig;
export function getSafeConfig(
  type: "value-props",
  config: unknown,
): ValuePropsConfig;
export function getSafeConfig(
  type: "page-hero",
  config: unknown,
): PageHeroConfig;
export function getSafeConfig(type: string, config: unknown): SectionConfig {
  // config をパース試行
  const result = validateSectionConfig(type, config);
  if (result.success) return result.data;
  // フォールバック: デフォルト値を取得
  const fallback = validateSectionConfig(type, {});
  if (fallback.success) return fallback.data;
  // 到達不能: 全セクションスキーマが {} からデフォルト値を生成可能
  throw new Error(`Unknown section type: ${type}`);
}
