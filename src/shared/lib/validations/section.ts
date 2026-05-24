/**
 * 統一セクション バリデーションスキーマ（re-export shell）
 *
 * 旧: 17 セクション分の inline schema 定義（805 行）
 * 新: canonical SSoT (`@/shared/lib/sections/definitions/<type>/schema.ts`) からの
 *     re-export + CRUD 共通スキーマ + 型ガードのみ。
 *
 * Section schema の正本は必ず `definitions/<type>/schema.ts`。
 * ここに inline schema 定義を再導入することは禁止（drift の温床）。
 *
 * SectionType 値は `Section.type String @db.VarChar(64)` で管理（Prisma enum 廃止後）。
 */

import { z } from "zod";

import {
  isSectionTypeKey,
  sectionDefinitions,
} from "@/shared/lib/sections/registry";

// =============================================================================
// SectionType 定数（DB VARCHAR の SSoT）
// =============================================================================

export const SectionType = {
  HERO: "hero",
  HERO_PARALLAX: "hero-parallax",
  CUSTOM: "custom",
  CONCEPT: "concept",
  SPACE_LIST: "space-list",
  SPACE_SHOWCASE: "space-showcase",
  NEWS_LIST: "news-list",
  POST_LIST: "post-list",
  FAQ_LIST: "faq-list",
  FEATURES: "features",
  TESTIMONIAL: "testimonial",
  GALLERY: "gallery",
  CTA: "cta",
  CONTACT_FORM: "contact-form",
  RESERVATION_FORM: "reservation-form",
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
  EVENT_CALENDAR: "event-calendar",
  LOCATION_LIST: "location-list",
  VALUE_PROPS: "value-props",
  PAGE_HERO: "page-hero",
} as const;

export type SectionType = (typeof SectionType)[keyof typeof SectionType];

const SECTION_TYPE_VALUES = [
  SectionType.HERO,
  SectionType.HERO_PARALLAX,
  SectionType.CUSTOM,
  SectionType.CONCEPT,
  SectionType.SPACE_LIST,
  SectionType.SPACE_SHOWCASE,
  SectionType.NEWS_LIST,
  SectionType.POST_LIST,
  SectionType.FAQ_LIST,
  SectionType.FEATURES,
  SectionType.TESTIMONIAL,
  SectionType.GALLERY,
  SectionType.CTA,
  SectionType.CONTACT_FORM,
  SectionType.RESERVATION_FORM,
  SectionType.MAP,
  SectionType.EMBED,
  SectionType.INSTAGRAM,
  SectionType.EVENT_CALENDAR,
  SectionType.LOCATION_LIST,
  SectionType.VALUE_PROPS,
  SectionType.PAGE_HERO,
] as const;

const VALID_SECTION_TYPES = new Set<string>(Object.values(SectionType));

export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && VALID_SECTION_TYPES.has(value);
}

// =============================================================================
// Canonical schema + 型 re-export（SSoT: definitions/<type>/schema.ts）
// =============================================================================

export {
  heroConfigSchema,
  type HeroConfig,
} from "@/shared/lib/sections/definitions/hero/schema";
export {
  heroParallaxConfigSchema,
  type HeroParallaxConfig,
} from "@/shared/lib/sections/definitions/hero-parallax/schema";
export {
  customConfigSchema,
  type CustomConfig,
} from "@/shared/lib/sections/definitions/custom/schema";
export {
  conceptConfigSchema,
  type ConceptConfig,
} from "@/shared/lib/sections/definitions/concept/schema";
export {
  spaceListConfigSchema,
  type SpaceListConfig,
} from "@/shared/lib/sections/definitions/space-list/schema";
export {
  spaceShowcaseConfigSchema,
  type SpaceShowcaseConfig,
} from "@/shared/lib/sections/definitions/space-showcase/schema";
export {
  newsListConfigSchema,
  type NewsListConfig,
} from "@/shared/lib/sections/definitions/news-list/schema";
export {
  postListConfigSchema,
  type PostListConfig,
} from "@/shared/lib/sections/definitions/post-list/schema";
export {
  faqListConfigSchema,
  type FaqListConfig,
} from "@/shared/lib/sections/definitions/faq-list/schema";
export {
  featuresConfigSchema,
  type FeaturesConfig,
} from "@/shared/lib/sections/definitions/features/schema";
export {
  testimonialConfigSchema,
  type TestimonialConfig,
} from "@/shared/lib/sections/definitions/testimonial/schema";
export {
  galleryConfigSchema,
  type GalleryConfig,
} from "@/shared/lib/sections/definitions/gallery/schema";
export {
  ctaConfigSchema,
  type CtaConfig,
} from "@/shared/lib/sections/definitions/cta/schema";
export {
  contactFormConfigSchema,
  type ContactFormConfig,
} from "@/shared/lib/sections/definitions/contact-form/schema";
export {
  reservationFormConfigSchema,
  type ReservationFormConfig,
} from "@/shared/lib/sections/definitions/reservation-form/schema";
export {
  mapConfigSchema,
  type MapConfig,
} from "@/shared/lib/sections/definitions/map/schema";
export {
  embedConfigSchema,
  type EmbedConfig,
} from "@/shared/lib/sections/definitions/embed/schema";
export {
  instagramConfigSchema,
  type InstagramConfig,
} from "@/shared/lib/sections/definitions/instagram/schema";
export {
  eventCalendarConfigSchema,
  type EventCalendarConfig,
} from "@/shared/lib/sections/definitions/event-calendar/schema";
export {
  locationListConfigSchema,
  type LocationListConfig,
} from "@/shared/lib/sections/definitions/location-list/schema";
export {
  valuePropsConfigSchema,
  type ValuePropsConfig,
} from "@/shared/lib/sections/definitions/value-props/schema";
export {
  pageHeroConfigSchema,
  type PageHeroConfig,
} from "@/shared/lib/sections/definitions/page-hero/schema";

// CTA / TextAlign の補助型・定数も互換 re-export
export type { CTAButtonItem } from "./cta-and-url";
export { ctaButtonVariants, ctaButtonSizes } from "./cta-and-url";
export type { TextAlign } from "./section-options";

// =============================================================================
// SectionConfig union（全 22 セクション）
// =============================================================================

import type { HeroConfig } from "@/shared/lib/sections/definitions/hero/schema";
import type { HeroParallaxConfig } from "@/shared/lib/sections/definitions/hero-parallax/schema";
import type { CustomConfig } from "@/shared/lib/sections/definitions/custom/schema";
import type { ConceptConfig } from "@/shared/lib/sections/definitions/concept/schema";
import type { SpaceListConfig } from "@/shared/lib/sections/definitions/space-list/schema";
import type { SpaceShowcaseConfig } from "@/shared/lib/sections/definitions/space-showcase/schema";
import type { NewsListConfig } from "@/shared/lib/sections/definitions/news-list/schema";
import type { PostListConfig } from "@/shared/lib/sections/definitions/post-list/schema";
import type { FaqListConfig } from "@/shared/lib/sections/definitions/faq-list/schema";
import type { FeaturesConfig } from "@/shared/lib/sections/definitions/features/schema";
import type { TestimonialConfig } from "@/shared/lib/sections/definitions/testimonial/schema";
import type { GalleryConfig } from "@/shared/lib/sections/definitions/gallery/schema";
import type { CtaConfig } from "@/shared/lib/sections/definitions/cta/schema";
import type { ContactFormConfig } from "@/shared/lib/sections/definitions/contact-form/schema";
import type { ReservationFormConfig } from "@/shared/lib/sections/definitions/reservation-form/schema";
import type { MapConfig } from "@/shared/lib/sections/definitions/map/schema";
import type { EmbedConfig } from "@/shared/lib/sections/definitions/embed/schema";
import type { InstagramConfig } from "@/shared/lib/sections/definitions/instagram/schema";
import type { EventCalendarConfig } from "@/shared/lib/sections/definitions/event-calendar/schema";
import type { LocationListConfig } from "@/shared/lib/sections/definitions/location-list/schema";
import type { ValuePropsConfig } from "@/shared/lib/sections/definitions/value-props/schema";
import type { PageHeroConfig } from "@/shared/lib/sections/definitions/page-hero/schema";

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
  | ReservationFormConfig
  | MapConfig
  | EmbedConfig
  | InstagramConfig
  | EventCalendarConfig
  | LocationListConfig
  | ValuePropsConfig
  | PageHeroConfig;

// =============================================================================
// セクション設定の検証（レジストリ委譲）
// =============================================================================

/**
 * type に応じた config を canonical schema で検証する。
 *
 * `isSectionTypeKey` で string を `SectionTypeKey` literal union に narrowing し、
 * `sectionDefinitions[type].configSchema.safeParse()` の戻り値型が全 22 schema の
 * output union (= `SectionConfig`) に subtype 包含される構造で `as cast` を排除。
 */
export function validateSectionConfig(
  type: string,
  config: unknown,
):
  | { success: true; data: SectionConfig }
  | { success: false; error: z.ZodError } {
  if (!isSectionTypeKey(type)) {
    return { success: false, error: new z.ZodError([]) };
  }
  const def = sectionDefinitions[type];
  const result = def.configSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }
  return { success: false, error: result.error };
}

// =============================================================================
// CRUD スキーマ（admin Server Actions 用）
// =============================================================================

export const createSectionSchema = z.object({
  pageId: z.string().uuid().optional(),
  type: z.enum(SECTION_TYPE_VALUES, {
    error: "有効なセクションタイプを選択してください",
  }),
  config: z.record(z.string(), z.unknown()).default({}),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

export const updateSectionContentSchema = z.strictObject({
  config: z.record(z.string(), z.unknown()).optional(),
});

export const updateSectionSchema = updateSectionContentSchema.extend({
  isActive: z.boolean().optional(),
});

export const updateSectionOrderSchema = z.object({
  sections: z
    .array(
      z.object({
        id: z.string().uuid(),
        order: z.number().int().min(0),
      }),
    )
    .refine((items) => new Set(items.map((i) => i.id)).size === items.length, {
      error: "同じIDを複数指定することはできません",
    }),
});

export type CreateSectionInput = z.infer<typeof createSectionSchema>;
export type UpdateSectionContentInput = z.infer<
  typeof updateSectionContentSchema
>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type UpdateSectionOrderInput = z.infer<typeof updateSectionOrderSchema>;

// =============================================================================
// 個別 type guards（runtime check が必要なケース用）
// =============================================================================

import { heroConfigSchema } from "@/shared/lib/sections/definitions/hero/schema";
import { heroParallaxConfigSchema } from "@/shared/lib/sections/definitions/hero-parallax/schema";
import { customConfigSchema } from "@/shared/lib/sections/definitions/custom/schema";
import { conceptConfigSchema } from "@/shared/lib/sections/definitions/concept/schema";
import { spaceListConfigSchema } from "@/shared/lib/sections/definitions/space-list/schema";
import { spaceShowcaseConfigSchema } from "@/shared/lib/sections/definitions/space-showcase/schema";
import { newsListConfigSchema } from "@/shared/lib/sections/definitions/news-list/schema";
import { postListConfigSchema } from "@/shared/lib/sections/definitions/post-list/schema";
import { faqListConfigSchema } from "@/shared/lib/sections/definitions/faq-list/schema";
import { featuresConfigSchema } from "@/shared/lib/sections/definitions/features/schema";
import { testimonialConfigSchema } from "@/shared/lib/sections/definitions/testimonial/schema";
import { galleryConfigSchema } from "@/shared/lib/sections/definitions/gallery/schema";
import { ctaConfigSchema } from "@/shared/lib/sections/definitions/cta/schema";
import { contactFormConfigSchema } from "@/shared/lib/sections/definitions/contact-form/schema";
import { mapConfigSchema } from "@/shared/lib/sections/definitions/map/schema";
import { embedConfigSchema } from "@/shared/lib/sections/definitions/embed/schema";
import { instagramConfigSchema } from "@/shared/lib/sections/definitions/instagram/schema";

function createConfigGuard<T>(schema: z.ZodType<T>) {
  return (config: unknown): config is T => schema.safeParse(config).success;
}

export const isHeroConfig = createConfigGuard(heroConfigSchema);
export const isHeroParallaxConfig = createConfigGuard(heroParallaxConfigSchema);
export const isCustomConfig = createConfigGuard(customConfigSchema);
export const isConceptConfig = createConfigGuard(conceptConfigSchema);
export const isSpaceListConfig = createConfigGuard(spaceListConfigSchema);
export const isSpaceShowcaseConfig = createConfigGuard(
  spaceShowcaseConfigSchema,
);
export const isNewsListConfig = createConfigGuard(newsListConfigSchema);
export const isPostListConfig = createConfigGuard(postListConfigSchema);
export const isFaqListConfig = createConfigGuard(faqListConfigSchema);
export const isFeaturesConfig = createConfigGuard(featuresConfigSchema);
export const isTestimonialConfig = createConfigGuard(testimonialConfigSchema);
export const isGalleryConfig = createConfigGuard(galleryConfigSchema);
export const isCtaConfig = createConfigGuard(ctaConfigSchema);
export const isContactFormConfig = createConfigGuard(contactFormConfigSchema);
export const isMapConfig = createConfigGuard(mapConfigSchema);
export const isEmbedConfig = createConfigGuard(embedConfigSchema);
export const isInstagramConfig = createConfigGuard(instagramConfigSchema);

// =============================================================================
// Parser / Metadata の互換 re-export
// =============================================================================

export {
  parseHeroHeight,
  parseSpaceLayout,
  parseNewsLayout,
  parsePostLayout,
  parseCtaVariant,
  parseGalleryLayout,
  parseGalleryGap,
  parseTestimonialLayout,
  parseTestimonialVariant,
  parseMapHeight,
  parseEmbedAspectRatio,
  parseCardStyle,
  parseBorderRadius,
  parseContainerWidth,
  parseGapSize,
  parseContentPosition,
  parseOverlayStyle,
  parseHeroParallaxHeight,
  parseFeaturesLayout,
  parseFaqInitialOpen,
  parseGalleryHoverEffect,
  parseConceptLayout,
  parseImageAspect,
  parseSpaceImageAspect,
  parsePostImageAspect,
  parseGalleryImageAspect,
  parseShowcaseImageAspect,
  parseHeroVariant,
  parseContactFormVariant,
  parseFaqVariant,
  parseImagePosition,
  parseTextAlign,
} from "./section-parsers";

export * from "./section-metadata";
