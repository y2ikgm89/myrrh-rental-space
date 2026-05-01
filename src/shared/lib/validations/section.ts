/**
 * 統一セクション バリデーションスキーマ
 *
 * 旧 homepage-section.ts + page-section.ts を統合。
 * SectionType に応じた config スキーマを Zod で型安全に管理。
 * admin/public 両方で使用。
 */

import { z } from "zod";
import {
  createInternalAppRouteSchema,
  createCtaButtonItemSchema,
} from "./cta-and-url";
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
} from "./section-options";

// =============================================================================
// SectionType 文字列定数（Prisma enum 廃止後の定義）
// =============================================================================

/**
 * セクションタイプ定数
 *
 * Prisma enum を廃止し、Section.type を String @db.VarChar(64) に変更。
 * 既存コードとの互換性のため as const オブジェクトで定義。
 */
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
  MAP: "map",
  EMBED: "embed",
  INSTAGRAM: "instagram",
  EVENT_CALENDAR: "event-calendar",
} as const;

export type SectionType = (typeof SectionType)[keyof typeof SectionType];

/** SectionType の値配列（z.enum 用） */
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
  SectionType.MAP,
  SectionType.EMBED,
  SectionType.INSTAGRAM,
  SectionType.EVENT_CALENDAR,
] as const;

export type { CTAButtonItem } from "./cta-and-url";
export { ctaButtonVariants, ctaButtonSizes } from "./cta-and-url";
export type { TextAlign } from "./section-options";

// =============================================================================
// 共通スキーマ
// =============================================================================

const internalAppRouteSchema = createInternalAppRouteSchema(500);
const viewAllUrlSchema = createInternalAppRouteSchema(200);
const ctaButtonItemSchema = createCtaButtonItemSchema(internalAppRouteSchema);
// ボタンの URL は React key の stable ID として使われるため、一意性を保証する
const ctaButtonsArraySchema = z
  .array(ctaButtonItemSchema)
  .refine(
    (buttons) => new Set(buttons.map((b) => b.url)).size === buttons.length,
    { error: "同じURLのボタンを複数登録することはできません" },
  );
const maxWidthSchema = z.enum(maxWidthValues).default("lg");

// =============================================================================
// セクションタイプ別 config スキーマ
// =============================================================================

// --- Hero variants ---

/** Hero セクション設定 */
export const heroConfigSchema = z.object({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  subtitle: z
    .string()
    .max(300, { error: "サブタイトルは300文字以内です" })
    .optional(),
  backgroundImage: z
    .object({
      url: z.string().default(""),
      alt: z.string().max(200).default(""),
      caption: z.string().max(300).default(""),
    })
    .default({ url: "", alt: "", caption: "" }),
  buttons: ctaButtonsArraySchema.default([]),
  height: z.enum(heroHeightValues).default("md"),
  heightCustom: z.number().min(20).max(100).default(60).optional(),
  overlay: z.boolean().default(true),
  overlayOpacity: z.number().min(0).max(100).default(40),
  variant: z.enum(heroVariantValues).default("default"),
  videoUrl: z.string().url().optional().or(z.literal("")),
  parallaxSpeed: z.number().min(0).max(1).default(0.5),
});

/** Hero Parallax セクション設定（v3） */
export const heroParallaxConfigSchema = z.object({
  tagline: z
    .string()
    .max(50, { error: "タグラインは50文字以内です" })
    .default("Luxury Rental Space"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("洗練された空間で 特別なひとときを"),
  subtitle: z
    .string()
    .max(300, { error: "サブタイトルは300文字以内です" })
    .default("厳選されたレンタルスペースが、あなたの大切な瞬間を彩ります。"),
  backgroundImage: z
    .object({
      url: z.string().default(""),
      alt: z.string().max(200).default(""),
      caption: z.string().max(300).default(""),
    })
    .default({ url: "", alt: "", caption: "" }),
  buttons: ctaButtonsArraySchema.default([
    {
      text: "Reserve Now",
      url: "/reservation",
      variant: "primary",
      size: "lg",
      iconName: "",
      openInNewTab: false,
    },
  ]),
  parallaxSpeed: z.number().min(0).max(1).default(0.3),
  overlayGradient: z.boolean().default(true),
  scrollIndicator: z.boolean().default(true),
  contentPosition: z.enum(contentPositionValues).default("center"),
  height: z.enum(heroParallaxHeightValues).default("lg"),
  heightCustom: z.number().min(20).max(100).default(80).optional(),
  overlayStyle: z.enum(overlayStyleValues).default("gradient"),
});

// --- Content ---

/** Custom セクション設定（Lexical リッチテキスト） */
export const customConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Contents"),
  maxWidth: maxWidthSchema,
  containerClass: z.string().max(200).optional(),
  backgroundColor: z.string().max(50).optional(),
  padding: z.enum(paddingValues).default("md"),
});

/** Concept セクション設定（v3） */
export const conceptConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Our Philosophy"),
  heading: z
    .string()
    .max(100, { error: "見出しは100文字以内です" })
    .default("空間が、体験を変える"),
  body: z
    .string()
    .max(1000, { error: "本文は1000文字以内です" })
    .default(
      "洗練されたデザインと上質な設備が調和する空間。\nビジネスミーティングからプライベートパーティーまで、\nあらゆるシーンに最適な環境をご用意しています。",
    ),
  image: z
    .object({
      url: z.string().default(""),
      alt: z.string().max(200).default(""),
      caption: z.string().max(300).default(""),
    })
    .default({ url: "", alt: "", caption: "" }),
  imagePosition: z.enum(imagePositionValues).default("right"),
  textAlign: z.enum(textAlignValues).default("left"),
  layout: z.enum(conceptLayoutValues).default("side-by-side"),
  imageAspect: z.enum(imageAspectValues).default("original"),
});

// --- Lists ---

/** SpaceList セクション設定 */
export const spaceListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Spaces"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("スペース一覧"),
  maxItems: z.number().int().min(1).max(24).default(6),
  showOnlyPublished: z.boolean().default(true),
  showViewAllLink: z.boolean().default(true),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全てのスペースを見る"),
  viewAllUrl: viewAllUrlSchema.default("/spaces"),
  layout: z.enum(spaceLayoutValues).default("grid"),
  columns: z.number().int().min(1).max(4).default(3),
  cardStyle: z.enum(cardStyleValues).default("bordered"),
  imageAspect: z.enum(spaceImageAspectValues).default("4:3"),
});

/** SpaceShowcase セクション設定（v3） */
export const spaceShowcaseConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Spaces"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("Our Spaces"),
  maxItems: z.number().int().min(1).max(12).default(3),
  showOnlyPublished: z.boolean().default(true),
  columns: z.number().int().min(2).max(4).default(3),
  cardStyle: z.enum(cardStyleValues).default("bordered"),
  imageAspect: z.enum(showcaseImageAspectValues).default("4:3"),
});

/** NewsList セクション設定 */
export const newsListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("News"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("お知らせ"),
  maxItems: z.number().int().min(1).max(20).default(5),
  showViewAllLink: z.boolean().default(true),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全てのお知らせ"),
  viewAllUrl: viewAllUrlSchema.default("/news"),
  layout: z.enum(newsLayoutValues).default("list"),
  columns: z.number().int().min(2).max(4).default(2),
});

/** PostList セクション設定 */
export const postListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Blog"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("最新の記事"),
  maxItems: z.number().int().min(1).max(20).default(6),
  showViewAllLink: z.boolean().default(true),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全ての記事"),
  viewAllUrl: viewAllUrlSchema.default("/posts"),
  categoryId: z.string().uuid().optional(),
  layout: z.enum(postLayoutValues).default("grid"),
  columns: z.number().int().min(1).max(4).default(3),
  imageAspect: z.enum(postImageAspectValues).default("16:9"),
});

/** FaqList セクション設定 */
export const faqListConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("FAQ"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("よくあるご質問"),
  categoryId: z.string().uuid().optional(),
  maxItems: z.number().int().min(1).max(50).default(10),
  showViewAllLink: z.boolean().default(true),
  viewAllText: z
    .string()
    .max(50, { error: "テキストは50文字以内です" })
    .default("全てのFAQ"),
  viewAllUrl: viewAllUrlSchema.default("/faq"),
  items: z
    .array(
      z.object({
        question: z
          .string()
          .min(1, { error: "質問は必須です" })
          .max(200, { error: "質問は200文字以内です" }),
        answer: z
          .string()
          .min(1, { error: "回答は必須です" })
          .max(5000, { error: "回答は5000文字以内です" }),
      }),
    )
    .optional(),
  variant: z.enum(faqVariantValues).default("default"),
  containerWidth: z.enum(containerWidthValues).default("md"),
  initialOpen: z.enum(faqInitialOpenValues).default(faqInitialOpenValues[1]),
});

// --- Features ---

/** Features セクション設定（v3） */
export const featuresConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Features"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("Features"),
  items: z
    .array(
      z.object({
        icon: z.string().max(50).optional(),
        title: z
          .string()
          .min(1, { error: "タイトルは必須です" })
          .max(100, { error: "タイトルは100文字以内です" }),
        description: z
          .string()
          .max(500, { error: "説明は500文字以内です" })
          .optional(),
      }),
    )
    .default([]),
  columns: z.number().int().min(1).max(4).default(3),
  layout: z.enum(featuresLayoutValues).default("hero-first"),
});

/** Testimonial セクション設定 */
export const testimonialConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Testimonials"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("お客様の声"),
  items: z
    .array(
      z.object({
        content: z
          .string()
          .min(1, { error: "内容は必須です" })
          .max(1000, { error: "内容は1000文字以内です" }),
        authorName: z
          .string()
          .min(1, { error: "名前は必須です" })
          .max(50, { error: "名前は50文字以内です" }),
        authorTitle: z.string().max(100).optional(),
        authorImage: z
          .object({
            url: z.string().default(""),
            alt: z.string().max(200).default(""),
          })
          .default({ url: "", alt: "" }),
        rating: z.number().int().min(1).max(5).optional(),
      }),
    )
    .default([]),
  layout: z.enum(testimonialLayoutValues).default("carousel"),
  showRating: z.boolean().default(true),
  variant: z.enum(testimonialVariantValues).default("default"),
});

/** Gallery セクション設定 */
export const galleryConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Gallery"),
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  images: z
    .array(
      z.object({
        url: z.string().url({ error: "有効なURLを入力してください" }),
        alt: z.string().max(200).optional(),
        caption: z.string().max(300).optional(),
      }),
    )
    .default([]),
  layout: z.enum(galleryLayoutValues).default("grid"),
  columns: z.number().int().min(1).max(6).default(3),
  gap: z.enum(galleryGapValues).default("md"),
  enableLightbox: z.boolean().default(true),
  imageAspect: z.enum(galleryImageAspectValues).default("original"),
  hoverEffect: z.enum(galleryHoverEffectValues).default("zoom"),
});

// --- Functional ---

/** CTA セクション設定 */
export const ctaConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Ready to Begin?"),
  title: z
    .string()
    .min(1, { error: "タイトルは必須です" })
    .max(100, { error: "タイトルは100文字以内です" }),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内です" })
    .optional(),
  buttons: ctaButtonsArraySchema.default([]),
  backgroundColor: z.string().max(50).optional(),
  variant: z.enum(ctaVariantValues).default("default"),
});

/** ContactForm セクション設定 */
export const contactFormConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Contact"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("お問い合わせ"),
  description: z
    .string()
    .max(500, { error: "説明は500文字以内です" })
    .optional(),
  showNameField: z.boolean().default(true),
  showPhoneField: z.boolean().default(true),
  showSubjectField: z.boolean().default(true),
  submitButtonText: z.string().max(30).default("送信する"),
  variant: z.enum(contactFormVariantValues).default("default"),
});

/** Map セクション設定 */
export const mapConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Location"),
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  address: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  zoom: z.number().int().min(1).max(20).default(15),
  height: z.enum(mapHeightValues).default("md"),
  showAddressBelow: z.boolean().default(true),
  borderRadius: z.enum(borderRadiusValues).default("sm"),
});

/** Embed セクション設定 */
export const embedConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Media"),
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  embedUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal("")),
  embedCode: z.string().max(10000).optional(),
  aspectRatio: z.enum(embedAspectRatioValues).default("16:9"),
  maxWidth: maxWidthSchema,
  borderRadius: z.enum(borderRadiusValues).default("sm"),
});

/** Instagram セクション設定 */
export const instagramConfigSchema = z.object({
  sectionLabel: z
    .string()
    .max(50, { error: "ラベルは50文字以内です" })
    .default("Follow Us"),
  title: z
    .string()
    .max(100, { error: "タイトルは100文字以内です" })
    .default("Instagram"),
  columns: z.number().int().min(3).max(6).default(6),
  count: z.number().int().min(6).max(12).default(6),
  gap: z.enum(gapSizeValues).default("md"),
});

// =============================================================================
// レジストリ委譲
// =============================================================================

import { getSectionDefinition } from "@/shared/lib/sections/registry";

/** SectionType 型ガード */
const VALID_SECTION_TYPES = new Set<string>(Object.values(SectionType));
export function isSectionType(value: unknown): value is SectionType {
  return typeof value === "string" && VALID_SECTION_TYPES.has(value);
}

/**
 * セクションタイプに応じた config を検証（レジストリ委譲）
 *
 * type は string を受け付け、未知の type は失敗を返す。
 * 戻り型を SectionConfig union に widening することで、
 * 呼び出し側の `as SectionConfig` が不要になる。
 */
export function validateSectionConfig(
  type: string,
  config: unknown,
):
  | { success: true; data: SectionConfig }
  | { success: false; error: z.ZodError } {
  const def = getSectionDefinition(type);
  if (!def) {
    return { success: false, error: new z.ZodError([]) };
  }
  const result = def.configSchema.safeParse(config);
  if (result.success) {
    return { success: true, data: result.data as SectionConfig };
  }
  return { success: false, error: result.error };
}

// =============================================================================
// CRUD スキーマ
// =============================================================================

/** セクション作成スキーマ */
export const createSectionSchema = z.object({
  pageId: z.string().uuid().optional(), // null = ホームページ
  type: z.enum(SECTION_TYPE_VALUES, {
    error: "有効なセクションタイプを選択してください",
  }),
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  contentJson: z
    .string()
    .max(500000, { error: "コンテンツは500,000文字以内です" })
    .optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
});

/** セクション本文更新スキーマ */
export const updateSectionContentSchema = z.strictObject({
  config: z.record(z.string(), z.unknown()).optional(),
  contentJson: z
    .string()
    .max(500000, { error: "コンテンツは500,000文字以内です" })
    .optional(),
});

/** セクション更新スキーマ */
export const updateSectionSchema = updateSectionContentSchema.extend({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  isActive: z.boolean().optional(),
});

/** セクション順序更新スキーマ */
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
export type UpdateSectionContentInput = z.infer<
  typeof updateSectionContentSchema
>;
export type UpdateSectionInput = z.infer<typeof updateSectionSchema>;
export type UpdateSectionOrderInput = z.infer<typeof updateSectionOrderSchema>;

// =============================================================================
// 型ガード関数
// =============================================================================

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
// Parse helpers（Zod 不使用 — クライアントバンドル軽量化）
// section-parsers.ts から re-export。admin/public 両方で使用可能。
// =============================================================================

export {
  parseHeroHeight,
  parseMaxWidth,
  parsePadding,
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

// Re-export metadata (labels, icons, categories)
export * from "./section-metadata";
