/**
 * セクション デフォルト設定・ゲッター
 *
 * レジストリ（registry.ts）へ委譲する薄いラッパー。
 * 旧 API との互換を維持しつつ、定義の正本はファイルベースレジストリに一元化する。
 */

import {
  getSectionDefinition,
  getDefaultConfig,
} from "@/shared/lib/sections/registry";
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

// =============================================================================
// デフォルト設定取得（レジストリ委譲）
// =============================================================================

/** string キーで defaultConfig を安全に参照（未知のタイプは undefined） */
export function getDefaultSectionConfig(
  type: string,
): SectionConfig | undefined {
  const def = getSectionDefinition(type);
  if (!def) return undefined;
  const result = def.configSchema.safeParse({});
  if (result.success) return result.data as SectionConfig;
  return undefined;
}

// =============================================================================
// 型特化 config ゲッター（レジストリ委譲）
// =============================================================================

function createTypedConfigGetter<T>(type: string) {
  return (config: unknown): T => {
    const def = getSectionDefinition(type);
    if (!def) return getDefaultConfig(type) as T;
    const result = def.configSchema.safeParse(config);
    return result.success ? (result.data as T) : (getDefaultConfig(type) as T);
  };
}

export const getHeroConfig = createTypedConfigGetter<HeroConfig>("hero");
export const getHeroParallaxConfig =
  createTypedConfigGetter<HeroParallaxConfig>("hero-parallax");
export const getCustomConfig = createTypedConfigGetter<CustomConfig>("custom");
export const getConceptConfig =
  createTypedConfigGetter<ConceptConfig>("concept");
export const getSpaceListConfig =
  createTypedConfigGetter<SpaceListConfig>("space-list");
export const getSpaceShowcaseConfig =
  createTypedConfigGetter<SpaceShowcaseConfig>("space-showcase");
export const getNewsListConfig =
  createTypedConfigGetter<NewsListConfig>("news-list");
export const getPostListConfig =
  createTypedConfigGetter<PostListConfig>("post-list");
export const getFaqListConfig =
  createTypedConfigGetter<FaqListConfig>("faq-list");
export const getFeaturesConfig =
  createTypedConfigGetter<FeaturesConfig>("features");
export const getTestimonialConfig =
  createTypedConfigGetter<TestimonialConfig>("testimonial");
export const getGalleryConfig =
  createTypedConfigGetter<GalleryConfig>("gallery");
export const getCtaConfig = createTypedConfigGetter<CtaConfig>("cta");
export const getContactFormConfig =
  createTypedConfigGetter<ContactFormConfig>("contact-form");
export const getMapConfig = createTypedConfigGetter<MapConfig>("map");
export const getEmbedConfig = createTypedConfigGetter<EmbedConfig>("embed");
export const getInstagramConfig =
  createTypedConfigGetter<InstagramConfig>("instagram");

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
export function getSafeConfig(type: string, config: unknown): SectionConfig {
  const def = getSectionDefinition(type);
  if (!def) return getDefaultConfig(type) as SectionConfig;
  const result = def.configSchema.safeParse(config);
  return result.success
    ? (result.data as SectionConfig)
    : (getDefaultConfig(type) as SectionConfig);
}
