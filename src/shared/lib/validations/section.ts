/**
 * 統一セクション バリデーションスキーマ
 *
 * 旧 homepage-section.ts + page-section.ts を統合。
 * SectionType に応じた config スキーマを Zod で型安全に管理。
 * admin/public 両方で使用。
 */

import { z } from "zod";
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
  type ImageAspect,
} from "./section-options";

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
// デフォルト設定
// =============================================================================

export const defaultSectionConfigs = {
  hero: {
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
  "hero-parallax": {
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
  custom: {
    sectionLabel: "Contents",
    maxWidth: "lg",
    containerClass: "",
    padding: "md",
  },
  concept: {
    sectionLabel: "Our Philosophy",
    heading: "空間が、体験を変える",
    body: "洗練されたデザインと上質な設備が調和する空間。\nビジネスミーティングからプライベートパーティーまで、\nあらゆるシーンに最適な環境をご用意しています。",
    imageUrl: "",
    imagePosition: "right",
    textAlign: "left",
    layout: "side-by-side",
    imageAspect: "original",
  },
  "space-list": {
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
  "space-showcase": {
    sectionLabel: "Spaces",
    title: "Our Spaces",
    maxItems: 3,
    showOnlyPublished: true,
    columns: 3,
    cardStyle: "bordered",
    imageAspect: "4:3",
  },
  "news-list": {
    sectionLabel: "News",
    title: "お知らせ",
    maxItems: 5,
    showViewAllLink: true,
    viewAllText: "全てのお知らせ",
    viewAllUrl: "/news",
    layout: "list",
    columns: 2,
  },
  "post-list": {
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
  "faq-list": {
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
  features: {
    sectionLabel: "Features",
    title: "Features",
    items: [],
    columns: 3,
    layout: "hero-first",
  },
  testimonial: {
    sectionLabel: "Testimonials",
    title: "お客様の声",
    items: [],
    layout: "carousel",
    showRating: true,
    variant: "default",
  },
  gallery: {
    sectionLabel: "Gallery",
    images: [],
    layout: "grid",
    columns: 3,
    gap: "md",
    enableLightbox: true,
    imageAspect: "original",
    hoverEffect: "zoom",
  },
  cta: {
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
  "contact-form": {
    sectionLabel: "Contact",
    title: "お問い合わせ",
    showNameField: true,
    showPhoneField: true,
    showSubjectField: true,
    submitButtonText: "送信する",
    variant: "default",
  },
  map: {
    sectionLabel: "Location",
    zoom: 15,
    height: "md",
    showAddressBelow: true,
    borderRadius: "sm",
  },
  embed: {
    sectionLabel: "Media",
    aspectRatio: "16:9",
    maxWidth: "lg",
    borderRadius: "sm",
  },
  instagram: {
    sectionLabel: "Follow Us",
    title: "Instagram",
    columns: 6,
    count: 6,
    gap: "md",
  },
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
// 表示名・説明・アイコン
// =============================================================================

export const sectionTypeLabels: Record<string, string> = {
  hero: "ヒーロー",
  "hero-parallax": "パララックスヒーロー",
  custom: "カスタム",
  concept: "コンセプト",
  "space-list": "スペース一覧",
  "space-showcase": "スペースショーケース",
  "news-list": "お知らせ一覧",
  "post-list": "記事一覧",
  "faq-list": "よくあるご質問",
  features: "特徴",
  testimonial: "体験談・レビュー",
  gallery: "ギャラリー",
  cta: "CTA（行動喚起）",
  "contact-form": "お問い合わせフォーム",
  map: "地図",
  embed: "埋め込み",
  instagram: "Instagram",
};

/** ホームページセクションのデフォルト順序 */
export const defaultHomepageSectionOrder: string[] = [
  "hero-parallax",
  "concept",
  "space-showcase",
  "features",
  "cta",
];
