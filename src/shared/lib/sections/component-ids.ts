/**
 * 標準セクションの識別子（Prisma SectionType enum の代替）
 *
 * DB の componentId カラムに格納される kebab-case 文字列。
 * Prisma の mapped enum パターン（as const + 型エイリアス）に準拠。
 */
export const StandardComponentId = {
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
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
} as const;

export type StandardComponentId =
  (typeof StandardComponentId)[keyof typeof StandardComponentId];

/**
 * 全 componentId の型（標準 + カスタム）。
 * レジストリの keyof で実際の ID を制約する。
 */
export type SectionComponentId = string;
