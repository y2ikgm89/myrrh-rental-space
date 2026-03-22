/**
 * 統一セクション バリデーションスキーマ
 *
 * 旧 homepage-section.ts + page-section.ts を統合。
 * SectionType に応じた config スキーマを Zod で型安全に管理。
 * admin/public 両方で使用。
 */

import { z } from "zod";
import { SectionType } from "@/shared/db/enums";
import {
  createSafeUrlSchema,
  createCtaSchemas,
  createCtaButtonItemSchema,
  transformLegacyCtaToButtons,
} from "./section-design";
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

export { SectionType };
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
// 共通スキーマ
// =============================================================================

const safeUrlSchema = createSafeUrlSchema(500);
const { ctaButtonSchema, optionalCtaButtonSchema } =
  createCtaSchemas(safeUrlSchema);
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema);
const maxWidthSchema = z.enum(maxWidthValues).default("lg");

// =============================================================================
// セクションタイプ別 config スキーマ
// =============================================================================

// --- Hero variants ---

/** Hero セクション設定（入力） */
const heroConfigRawSchema = z.object({
  title: z.string().max(100, { error: "タイトルは100文字以内です" }).optional(),
  subtitle: z
    .string()
    .max(300, { error: "サブタイトルは300文字以内です" })
    .optional(),
  backgroundImageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal("")),
  buttons: z.array(ctaButtonItemSchema).optional(),
  ctaPrimary: ctaButtonSchema.optional(),
  ctaSecondary: optionalCtaButtonSchema,
  height: z.enum(heroHeightValues).default("md"),
  overlay: z.boolean().default(true),
  overlayOpacity: z.number().min(0).max(100).default(40),
  variant: z.enum(heroVariantValues).default("default"),
  videoUrl: z.string().url().optional().or(z.literal("")),
  parallaxSpeed: z.number().min(0).max(1).default(0.5),
});
/** Hero セクション設定（出力: レガシーCTA → buttons[] 統一） */
export const heroConfigSchema = heroConfigRawSchema.transform(
  ({ ctaPrimary, ctaSecondary, buttons, ...rest }) => ({
    ...rest,
    buttons:
      buttons && buttons.length > 0
        ? buttons
        : transformLegacyCtaToButtons(ctaPrimary, ctaSecondary),
  }),
);

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
  backgroundImageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal("")),
  buttons: z.array(ctaButtonItemSchema).default([
    {
      text: "Reserve Now",
      url: "/reservation",
      variant: "primary",
      size: "lg",
      openInNewTab: false,
    },
  ]),
  parallaxSpeed: z.number().min(0).max(1).default(0.3),
  overlayGradient: z.boolean().default(true),
  scrollIndicator: z.boolean().default(true),
  contentPosition: z.enum(contentPositionValues).default("center"),
  height: z.enum(heroParallaxHeightValues).default("full"),
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
  imageUrl: z
    .string()
    .url({ error: "有効なURLを入力してください" })
    .optional()
    .or(z.literal("")),
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
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/spaces"),
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
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/news"),
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
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/posts"),
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
  viewAllUrl: z
    .string()
    .max(200, { error: "URLは200文字以内です" })
    .default("/faq"),
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
        authorImageUrl: z.string().url().optional().or(z.literal("")),
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

/** CTA セクション設定（入力） */
const ctaConfigRawSchema = z.object({
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
  buttons: z.array(ctaButtonItemSchema).optional(),
  ctaPrimary: ctaButtonSchema.optional(),
  ctaSecondary: optionalCtaButtonSchema,
  backgroundColor: z.string().max(50).optional(),
  variant: z.enum(ctaVariantValues).default("default"),
});
/** CTA セクション設定（出力: レガシーCTA → buttons[] 統一） */
export const ctaConfigSchema = ctaConfigRawSchema.transform(
  ({ ctaPrimary, ctaSecondary, buttons, ...rest }) => ({
    ...rest,
    buttons:
      buttons && buttons.length > 0
        ? buttons
        : transformLegacyCtaToButtons(ctaPrimary, ctaSecondary),
  }),
);

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
// 統合スキーママップ
// =============================================================================

/**
 * SectionType → config スキーマのマッピング
 */
export const sectionConfigSchemas = {
  [SectionType.HERO]: heroConfigSchema,
  [SectionType.HERO_PARALLAX]: heroParallaxConfigSchema,
  [SectionType.CUSTOM]: customConfigSchema,
  [SectionType.CONCEPT]: conceptConfigSchema,
  [SectionType.SPACE_LIST]: spaceListConfigSchema,
  [SectionType.SPACE_SHOWCASE]: spaceShowcaseConfigSchema,
  [SectionType.NEWS_LIST]: newsListConfigSchema,
  [SectionType.POST_LIST]: postListConfigSchema,
  [SectionType.FAQ_LIST]: faqListConfigSchema,
  [SectionType.FEATURES]: featuresConfigSchema,
  [SectionType.TESTIMONIAL]: testimonialConfigSchema,
  [SectionType.GALLERY]: galleryConfigSchema,
  [SectionType.CTA]: ctaConfigSchema,
  [SectionType.CONTACT_FORM]: contactFormConfigSchema,
  [SectionType.MAP]: mapConfigSchema,
  [SectionType.EMBED]: embedConfigSchema,
  [SectionType.INSTAGRAM]: instagramConfigSchema,
} satisfies Record<SectionType, z.ZodType>;

type SectionConfigSchemas = typeof sectionConfigSchemas;

function createSectionConfigParser<TSchema extends z.ZodType>(
  schema: TSchema,
  fallback: z.output<TSchema>,
) {
  return (config: unknown): z.output<TSchema> => {
    const result = schema.safeParse(config);
    return result.success ? result.data : fallback;
  };
}

/**
 * セクションタイプに応じた config を検証
 *
 * 戻り型を SectionConfig union に widening することで、
 * 呼び出し側の `as SectionConfig` が不要になる。
 */
export function validateSectionConfig(
  type: SectionType,
  config: unknown,
): z.ZodSafeParseResult<SectionConfig> {
  const schema = sectionConfigSchemas[type];
  // 各スキーマの safeParse 結果は個別型だが、SectionConfig union の部分型なので安全
  return schema.safeParse(config);
}

// =============================================================================
// CRUD スキーマ
// =============================================================================

/** セクション作成スキーマ */
export const createSectionSchema = z.object({
  pageId: z.string().uuid().optional(), // null = ホームページ
  type: z.enum(SectionType),
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

/**
 * 汎用: セクションタイプに応じた config 取得（型安全）
 */
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

// Re-export metadata (labels, icons, categories)
export * from "./section-metadata";
