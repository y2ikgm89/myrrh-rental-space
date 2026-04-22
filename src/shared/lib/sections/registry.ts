// src/shared/lib/sections/registry.ts
//
// セクションレジストリ — 全 21 セクション定義を集約し、ルックアップ・バリデーション関数を提供する。

import type { SectionCategory, SectionDefinition } from "./types";
import { isRecord } from "@/shared/lib/serialize";

import { contactFormConfigSchema } from "./definitions/contact-form/schema";
import { contactFormMetadata } from "./definitions/contact-form/metadata";
import { conceptConfigSchema } from "./definitions/concept/schema";
import { conceptMetadata } from "./definitions/concept/metadata";
import { ctaConfigSchema } from "./definitions/cta/schema";
import { ctaMetadata } from "./definitions/cta/metadata";
import { customConfigSchema } from "./definitions/custom/schema";
import { customMetadata } from "./definitions/custom/metadata";
import { embedConfigSchema } from "./definitions/embed/schema";
import { embedMetadata } from "./definitions/embed/metadata";
import { faqListConfigSchema } from "./definitions/faq-list/schema";
import { faqListMetadata } from "./definitions/faq-list/metadata";
import { featuresConfigSchema } from "./definitions/features/schema";
import { featuresMetadata } from "./definitions/features/metadata";
import { galleryConfigSchema } from "./definitions/gallery/schema";
import { galleryMetadata } from "./definitions/gallery/metadata";
import { heroConfigSchema } from "./definitions/hero/schema";
import { heroMetadata } from "./definitions/hero/metadata";
import { heroParallaxConfigSchema } from "./definitions/hero-parallax/schema";
import { heroParallaxMetadata } from "./definitions/hero-parallax/metadata";
import { instagramConfigSchema } from "./definitions/instagram/schema";
import { instagramMetadata } from "./definitions/instagram/metadata";
import { mapConfigSchema } from "./definitions/map/schema";
import { mapMetadata } from "./definitions/map/metadata";
import { newsListConfigSchema } from "./definitions/news-list/schema";
import { newsListMetadata } from "./definitions/news-list/metadata";
import { postListConfigSchema } from "./definitions/post-list/schema";
import { postListMetadata } from "./definitions/post-list/metadata";
import { spaceListConfigSchema } from "./definitions/space-list/schema";
import { spaceListMetadata } from "./definitions/space-list/metadata";
import { spaceShowcaseConfigSchema } from "./definitions/space-showcase/schema";
import { spaceShowcaseMetadata } from "./definitions/space-showcase/metadata";
import { testimonialConfigSchema } from "./definitions/testimonial/schema";
import { testimonialMetadata } from "./definitions/testimonial/metadata";
import { eventCalendarConfigSchema } from "./definitions/event-calendar/schema";
import { eventCalendarMetadata } from "./definitions/event-calendar/metadata";
import { homepageHowItWorksConfigSchema } from "./definitions/homepage-how-it-works/schema";
import { homepageHowItWorksMetadata } from "./definitions/homepage-how-it-works/metadata";
import { homepageSpacesConfigSchema } from "./definitions/homepage-spaces/schema";
import { homepageSpacesMetadata } from "./definitions/homepage-spaces/metadata";
import { homepageFeaturesConfigSchema } from "./definitions/homepage-features/schema";
import { homepageFeaturesMetadata } from "./definitions/homepage-features/metadata";
import { homepageCtaConfigSchema } from "./definitions/homepage-cta/schema";
import { homepageCtaMetadata } from "./definitions/homepage-cta/metadata";

// ─────────────────────────────────────────────────────────────
// 定義レコード
// ─────────────────────────────────────────────────────────────

/** 全 21 セクション定義 */
const definitions: Record<string, SectionDefinition> = {
  hero: {
    type: "hero",
    configSchema: heroConfigSchema,
    metadata: heroMetadata,
  },
  "hero-parallax": {
    type: "hero-parallax",
    configSchema: heroParallaxConfigSchema,
    metadata: heroParallaxMetadata,
  },
  custom: {
    type: "custom",
    configSchema: customConfigSchema,
    metadata: customMetadata,
  },
  concept: {
    type: "concept",
    configSchema: conceptConfigSchema,
    metadata: conceptMetadata,
  },
  "space-list": {
    type: "space-list",
    configSchema: spaceListConfigSchema,
    metadata: spaceListMetadata,
  },
  "space-showcase": {
    type: "space-showcase",
    configSchema: spaceShowcaseConfigSchema,
    metadata: spaceShowcaseMetadata,
  },
  "news-list": {
    type: "news-list",
    configSchema: newsListConfigSchema,
    metadata: newsListMetadata,
  },
  "post-list": {
    type: "post-list",
    configSchema: postListConfigSchema,
    metadata: postListMetadata,
  },
  "faq-list": {
    type: "faq-list",
    configSchema: faqListConfigSchema,
    metadata: faqListMetadata,
  },
  features: {
    type: "features",
    configSchema: featuresConfigSchema,
    metadata: featuresMetadata,
  },
  testimonial: {
    type: "testimonial",
    configSchema: testimonialConfigSchema,
    metadata: testimonialMetadata,
  },
  gallery: {
    type: "gallery",
    configSchema: galleryConfigSchema,
    metadata: galleryMetadata,
  },
  cta: {
    type: "cta",
    configSchema: ctaConfigSchema,
    metadata: ctaMetadata,
  },
  "contact-form": {
    type: "contact-form",
    configSchema: contactFormConfigSchema,
    metadata: contactFormMetadata,
  },
  map: {
    type: "map",
    configSchema: mapConfigSchema,
    metadata: mapMetadata,
  },
  embed: {
    type: "embed",
    configSchema: embedConfigSchema,
    metadata: embedMetadata,
  },
  instagram: {
    type: "instagram",
    configSchema: instagramConfigSchema,
    metadata: instagramMetadata,
  },
  "event-calendar": {
    type: "event-calendar",
    configSchema: eventCalendarConfigSchema,
    metadata: eventCalendarMetadata,
  },
  "homepage-how-it-works": {
    type: "homepage-how-it-works",
    configSchema: homepageHowItWorksConfigSchema,
    metadata: homepageHowItWorksMetadata,
  },
  "homepage-spaces": {
    type: "homepage-spaces",
    configSchema: homepageSpacesConfigSchema,
    metadata: homepageSpacesMetadata,
  },
  "homepage-features": {
    type: "homepage-features",
    configSchema: homepageFeaturesConfigSchema,
    metadata: homepageFeaturesMetadata,
  },
  "homepage-cta": {
    type: "homepage-cta",
    configSchema: homepageCtaConfigSchema,
    metadata: homepageCtaMetadata,
  },
};

// ─────────────────────────────────────────────────────────────
// 公開 API
// ─────────────────────────────────────────────────────────────

/**
 * タイプ文字列からセクション定義を取得する。
 * 存在しない場合は `undefined` を返す。
 */
export function getSectionDefinition(
  type: string,
): SectionDefinition | undefined {
  return definitions[type];
}

/**
 * 全セクション定義を配列で返す。
 */
export function getAllSectionDefinitions(): SectionDefinition[] {
  return Object.values(definitions);
}

/**
 * カテゴリ別にセクション定義をグループ化して返す。
 */
export function getSectionDefinitionsByCategory(): Record<
  SectionCategory,
  SectionDefinition[]
> {
  const grouped: Record<SectionCategory, SectionDefinition[]> = {
    hero: [],
    content: [],
    list: [],
    functional: [],
    media: [],
  };

  for (const def of Object.values(definitions)) {
    grouped[def.metadata.category].push(def);
  }

  return grouped;
}

/**
 * 指定タイプの config を Zod スキーマでバリデーションする。
 * タイプが存在しない場合、または Zod バリデーション失敗時は `success: false` を返す。
 */
export function validateSectionConfig(
  type: string,
  config: unknown,
): { success: true; data: unknown } | { success: false; error: string } {
  const def = definitions[type];
  if (!def) {
    return { success: false, error: `Unknown section type: ${type}` };
  }

  const result = def.configSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data };
  }

  return { success: false, error: result.error.message };
}

/**
 * 指定タイプのデフォルト config を返す。
 * スキーマに `.parse({})` を通すことで全フィールドのデフォルト値を取得する。
 * タイプが存在しない場合は空オブジェクトを返す。
 */
export function getDefaultConfig(type: string): Record<string, unknown> {
  const def = definitions[type];
  if (!def) {
    return {};
  }

  const result = def.configSchema.safeParse({});
  if (result.success) {
    const data = result.data;
    if (isRecord(data)) {
      return data;
    }
  }

  return {};
}

/**
 * セクション定義を追加登録する（CLI 拡張ポイント）。
 * 既存タイプを上書きする場合も同様に使用できる。
 */
export function registerSectionDefinition(def: SectionDefinition): void {
  definitions[def.type] = def;
}
