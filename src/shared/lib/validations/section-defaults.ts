/**
 * セクション デフォルト設定・ゲッター
 *
 * レジストリ（registry.ts）由来の canonical schema を使い、公開レンダラーが
 * セクション別の型付き config を取得するための facade。
 */

import type { SectionConfig } from "./section";
import { validateSectionConfig } from "./section";
import { locationListConfigSchema } from "@/shared/lib/sections/definitions/location-list/schema";
import { eventCalendarConfigSchema } from "@/shared/lib/sections/definitions/event-calendar/schema";
import { reservationFormConfigSchema } from "@/shared/lib/sections/definitions/reservation-form/schema";
import { valuePropsConfigSchema } from "@/shared/lib/sections/definitions/value-props/schema";
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
