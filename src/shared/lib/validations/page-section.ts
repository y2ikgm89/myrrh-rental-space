/**
 * ページセクション バリデーションスキーマ
 *
 * 各セクションタイプに応じた設定スキーマを定義
 * Zod discriminated union で型安全なJSON config を実現
 *
 * HomepageSectionパターンを拡張
 * admin/public両方で使用
 */

import { z } from 'zod'
import { PageSectionType } from '@/shared/generated/prisma/enums'
import {
  createSafeUrlSchema,
  createCtaSchemas,
  createCtaButtonItemSchema,
  transformCtaFields,
  animationSchema,
  responsiveSchema,
  spacingSchema,
  defaultDesignParams,
} from './section-design'

export { PageSectionType }
export { animationSchema, responsiveSchema, spacingSchema }
export type { CTAButtonItem } from './section-design'
export { ctaButtonVariants, ctaButtonSizes } from './section-design'

// =============================================================================
// 共通スキーマ（URL最大500文字）
// =============================================================================

const safeUrlSchema = createSafeUrlSchema(500)
const { ctaButtonSchema, optionalCtaButtonSchema } = createCtaSchemas(safeUrlSchema)
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema)

/**
 * 最大幅設定
 */
const maxWidthSchema = z.enum(['sm', 'md', 'lg', 'xl', 'full']).default('lg')

// =============================================================================
// セクションタイプ別設定スキーマ
// =============================================================================

/**
 * Hero セクション設定（入力スキーマ）
 * レガシー ctaPrimary/ctaSecondary と新 buttons[] の両方を受容
 */
const heroConfigRawSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  subtitle: z.string().max(300, { error: 'サブタイトルは300文字以内です' }).optional(),
  backgroundImageUrl: z.string().url({ error: '有効なURLを入力してください' }).optional().or(z.literal('')),
  // NEW: ボタン配列
  buttons: z.array(ctaButtonItemSchema).optional(),
  // LEGACY: 入力のみ受容
  ctaPrimary: ctaButtonSchema.optional(),
  ctaSecondary: optionalCtaButtonSchema,
  height: z.enum(['sm', 'md', 'lg', 'full']).default('md'),
  overlay: z.boolean().default(true),
  overlayOpacity: z.number().min(0).max(100).default(40),
  // バリアント
  variant: z.enum(['default', 'minimal', 'split', 'video', 'parallax']).default('default'),
  videoUrl: z.string().url().optional().or(z.literal('')),
  parallaxSpeed: z.number().min(0).max(1).default(0.5),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * Hero セクション設定（出力スキーマ）
 * .transform() でレガシー → buttons[] に統一
 */
export const heroConfigSchema = heroConfigRawSchema.transform(transformCtaFields)

/**
 * Custom セクション設定（Lexicalリッチテキスト）
 * - contentフィールドにLexical HTMLを格納
 */
export const customConfigSchema = z.object({
  maxWidth: maxWidthSchema,
  containerClass: z.string().max(200).optional(),
  backgroundColor: z.string().max(50).optional(),
  padding: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * ContactForm セクション設定
 */
export const contactFormConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('お問い合わせ'),
  description: z.string().max(500, { error: '説明は500文字以内です' }).optional(),
  showNameField: z.boolean().default(true),
  showPhoneField: z.boolean().default(true),
  showSubjectField: z.boolean().default(true),
  submitButtonText: z.string().max(30).default('送信する'),
  // バリアント
  variant: z.enum(['default', 'minimal', 'split']).default('default'),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * FaqList セクション設定
 */
export const faqListConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('よくあるご質問'),
  categoryId: z.string().uuid().optional(),
  maxItems: z.number().int().min(1).max(50).default(10),
  showViewAllLink: z.boolean().default(true),
  items: z
    .array(
      z.object({
        question: z.string().min(1, { error: '質問は必須です' }).max(200, { error: '質問は200文字以内です' }),
        answer: z.string().min(1, { error: '回答は必須です' }).max(5000, { error: '回答は5000文字以内です' }),
      })
    )
    .optional(),
  // バリアント
  variant: z.enum(['default', 'bordered', 'minimal']).default('default'),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * SpaceList セクション設定
 */
export const spaceListConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('スペース一覧'),
  maxItems: z.number().int().min(1).max(24).default(6),
  showOnlyPublished: z.boolean().default(true),
  showViewAllLink: z.boolean().default(true),
  layout: z.enum(['grid', 'list', 'carousel']).default('grid'),
  columns: z.number().int().min(1).max(4).default(3),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * NewsList セクション設定
 */
export const newsListConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('お知らせ'),
  maxItems: z.number().int().min(1).max(20).default(5),
  showViewAllLink: z.boolean().default(true),
  layout: z.enum(['list', 'card']).default('list'),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * PostList セクション設定
 */
export const postListConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('最新の記事'),
  maxItems: z.number().int().min(1).max(20).default(6),
  showViewAllLink: z.boolean().default(true),
  categoryId: z.string().uuid().optional(),
  layout: z.enum(['grid', 'list']).default('grid'),
  columns: z.number().int().min(1).max(4).default(3),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * CTA セクション設定（入力スキーマ）
 * レガシー ctaPrimary/ctaSecondary と新 buttons[] の両方を受容
 */
const ctaConfigRawSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(100, { error: 'タイトルは100文字以内です' }),
  description: z.string().max(500, { error: '説明は500文字以内です' }).optional(),
  // NEW: ボタン配列
  buttons: z.array(ctaButtonItemSchema).optional(),
  // LEGACY: 入力のみ受容
  ctaPrimary: ctaButtonSchema.optional(),
  ctaSecondary: optionalCtaButtonSchema,
  backgroundColor: z.string().max(50).optional(),
  variant: z.enum(['default', 'centered', 'split']).default('default'),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * CTA セクション設定（出力スキーマ）
 * .transform() でレガシー → buttons[] に統一
 */
export const ctaConfigSchema = ctaConfigRawSchema.transform(transformCtaFields)

/**
 * Gallery セクション設定
 */
export const galleryConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  images: z
    .array(
      z.object({
        url: z.string().url({ error: '有効なURLを入力してください' }),
        alt: z.string().max(200).optional(),
        caption: z.string().max(300).optional(),
      })
    )
    .default([]),
  layout: z.enum(['grid', 'masonry', 'carousel']).default('grid'),
  columns: z.number().int().min(1).max(6).default(3),
  gap: z.enum(['none', 'sm', 'md', 'lg']).default('md'),
  enableLightbox: z.boolean().default(true),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * Testimonial セクション設定
 */
export const testimonialConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('お客様の声'),
  items: z
    .array(
      z.object({
        content: z.string().min(1, { error: '内容は必須です' }).max(1000, { error: '内容は1000文字以内です' }),
        authorName: z.string().min(1, { error: '名前は必須です' }).max(50, { error: '名前は50文字以内です' }),
        authorTitle: z.string().max(100).optional(),
        authorImageUrl: z.string().url().optional().or(z.literal('')),
        rating: z.number().int().min(1).max(5).optional(),
      })
    )
    .default([]),
  layout: z.enum(['grid', 'carousel', 'list']).default('carousel'),
  showRating: z.boolean().default(true),
  // バリアント
  variant: z.enum(['default', 'card', 'minimal']).default('default'),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * Map セクション設定
 */
export const mapConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  address: z.string().max(300).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  zoom: z.number().int().min(1).max(20).default(15),
  height: z.enum(['sm', 'md', 'lg']).default('md'),
  showAddressBelow: z.boolean().default(true),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * Embed セクション設定
 */
export const embedConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  embedUrl: z.string().url({ error: '有効なURLを入力してください' }).optional().or(z.literal('')),
  embedCode: z.string().max(10000).optional(),
  aspectRatio: z.enum(['16:9', '4:3', '1:1', 'auto']).default('16:9'),
  maxWidth: maxWidthSchema,
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

// =============================================================================
// 統合スキーマ
// =============================================================================

/**
 * セクションタイプ → 設定スキーマのマッピング
 */
export const sectionConfigSchemas = {
  [PageSectionType.HERO]: heroConfigSchema,
  [PageSectionType.CUSTOM]: customConfigSchema,
  [PageSectionType.CONTACT_FORM]: contactFormConfigSchema,
  [PageSectionType.FAQ_LIST]: faqListConfigSchema,
  [PageSectionType.SPACE_LIST]: spaceListConfigSchema,
  [PageSectionType.NEWS_LIST]: newsListConfigSchema,
  [PageSectionType.POST_LIST]: postListConfigSchema,
  [PageSectionType.CTA]: ctaConfigSchema,
  [PageSectionType.GALLERY]: galleryConfigSchema,
  [PageSectionType.TESTIMONIAL]: testimonialConfigSchema,
  [PageSectionType.MAP]: mapConfigSchema,
  [PageSectionType.EMBED]: embedConfigSchema,
} satisfies Record<PageSectionType, z.ZodType>

type SectionConfigSchemas = typeof sectionConfigSchemas

/**
 * セクションタイプに応じた設定を検証
 */
export function validateSectionConfig<T extends PageSectionType>(type: T, config: unknown) {
  const schema = sectionConfigSchemas[type]
  return schema.safeParse(config)
}

/**
 * ページセクション作成スキーマ
 */
export const createPageSectionSchema = z.object({
  pageId: z.string().uuid({ error: 'ページIDは必須です' }),
  type: z.nativeEnum(PageSectionType),
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  content: z.string().max(500000, { error: 'コンテンツは500,000文字以内です' }).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
})

/**
 * ページセクション更新スキーマ
 */
export const updatePageSectionSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().max(500000, { error: 'コンテンツは500,000文字以内です' }).optional(),
  isActive: z.boolean().optional(),
})

/**
 * セクション順序更新スキーマ
 */
export const updateSectionOrderSchema = z.object({
  sections: z.array(
    z.object({
      id: z.string().uuid(),
      order: z.number().int().min(0),
    })
  ),
})

// =============================================================================
// 型エクスポート
// =============================================================================

// Output types (バリデーション後の型、defaultが適用された状態)
export type HeroConfig = z.output<typeof heroConfigSchema>
export type CustomConfig = z.output<typeof customConfigSchema>
export type ContactFormConfig = z.output<typeof contactFormConfigSchema>
export type FaqListConfig = z.output<typeof faqListConfigSchema>
export type SpaceListConfig = z.output<typeof spaceListConfigSchema>
export type NewsListConfig = z.output<typeof newsListConfigSchema>
export type PostListConfig = z.output<typeof postListConfigSchema>
export type CtaConfig = z.output<typeof ctaConfigSchema>
export type GalleryConfig = z.output<typeof galleryConfigSchema>
export type TestimonialConfig = z.output<typeof testimonialConfigSchema>
export type MapConfig = z.output<typeof mapConfigSchema>
export type EmbedConfig = z.output<typeof embedConfigSchema>

// Input types (フォーム入力用、defaultなし)
export type HeroConfigInput = z.input<typeof heroConfigSchema>
export type CustomConfigInput = z.input<typeof customConfigSchema>
export type ContactFormConfigInput = z.input<typeof contactFormConfigSchema>
export type FaqListConfigInput = z.input<typeof faqListConfigSchema>
export type SpaceListConfigInput = z.input<typeof spaceListConfigSchema>
export type NewsListConfigInput = z.input<typeof newsListConfigSchema>
export type PostListConfigInput = z.input<typeof postListConfigSchema>
export type CtaConfigInput = z.input<typeof ctaConfigSchema>
export type GalleryConfigInput = z.input<typeof galleryConfigSchema>
export type TestimonialConfigInput = z.input<typeof testimonialConfigSchema>
export type MapConfigInput = z.input<typeof mapConfigSchema>
export type EmbedConfigInput = z.input<typeof embedConfigSchema>

export type PageSectionConfig =
  | HeroConfig
  | CustomConfig
  | ContactFormConfig
  | FaqListConfig
  | SpaceListConfig
  | NewsListConfig
  | PostListConfig
  | CtaConfig
  | GalleryConfig
  | TestimonialConfig
  | MapConfig
  | EmbedConfig

export type CreatePageSectionInput = z.infer<typeof createPageSectionSchema>
export type UpdatePageSectionInput = z.infer<typeof updatePageSectionSchema>
export type UpdateSectionOrderInput = z.infer<typeof updateSectionOrderSchema>

// =============================================================================
// 型ガード関数
// =============================================================================

/**
 * 汎用型ガードファクトリ
 * 各セクションタイプ用の型ガード関数を生成
 */
function createConfigGuard<T>(schema: z.ZodType<T>) {
  return (config: unknown): config is T => schema.safeParse(config).success
}

export const isHeroConfig = createConfigGuard(heroConfigSchema)
export const isCustomConfig = createConfigGuard(customConfigSchema)
export const isContactFormConfig = createConfigGuard(contactFormConfigSchema)
export const isFaqListConfig = createConfigGuard(faqListConfigSchema)
export const isSpaceListConfig = createConfigGuard(spaceListConfigSchema)
export const isNewsListConfig = createConfigGuard(newsListConfigSchema)
export const isPostListConfig = createConfigGuard(postListConfigSchema)
export const isCtaConfig = createConfigGuard(ctaConfigSchema)
export const isGalleryConfig = createConfigGuard(galleryConfigSchema)
export const isTestimonialConfig = createConfigGuard(testimonialConfigSchema)
export const isMapConfig = createConfigGuard(mapConfigSchema)
export const isEmbedConfig = createConfigGuard(embedConfigSchema)

// =============================================================================
// 型特化ヘルパー関数（型アサーション不要）
// =============================================================================

/**
 * 汎用configゲッターファクトリ
 * safeParse成功時はパース結果を、失敗時はデフォルト値を返す
 */
function createConfigGetter<T extends PageSectionType>(
  type: T,
  schema: z.ZodType<z.infer<SectionConfigSchemas[T]>>
) {
  return (config: unknown): z.infer<SectionConfigSchemas[T]> => {
    const result = schema.safeParse(config)
    return result.success ? result.data : defaultSectionConfigs[type]
  }
}

export const getHeroConfig = createConfigGetter(PageSectionType.HERO, heroConfigSchema)
export const getCustomConfig = createConfigGetter(PageSectionType.CUSTOM, customConfigSchema)
export const getContactFormConfig = createConfigGetter(PageSectionType.CONTACT_FORM, contactFormConfigSchema)
export const getFaqListConfig = createConfigGetter(PageSectionType.FAQ_LIST, faqListConfigSchema)
export const getSpaceListConfig = createConfigGetter(PageSectionType.SPACE_LIST, spaceListConfigSchema)
export const getNewsListConfig = createConfigGetter(PageSectionType.NEWS_LIST, newsListConfigSchema)
export const getPostListConfig = createConfigGetter(PageSectionType.POST_LIST, postListConfigSchema)
export const getCtaConfig = createConfigGetter(PageSectionType.CTA, ctaConfigSchema)
export const getGalleryConfig = createConfigGetter(PageSectionType.GALLERY, galleryConfigSchema)
export const getTestimonialConfig = createConfigGetter(PageSectionType.TESTIMONIAL, testimonialConfigSchema)
export const getMapConfig = createConfigGetter(PageSectionType.MAP, mapConfigSchema)
export const getEmbedConfig = createConfigGetter(PageSectionType.EMBED, embedConfigSchema)

/**
 * 汎用: セクションタイプに応じたconfig取得（型安全）
 *
 * Note: Zodのジェネリック型推論の制約により、型アサーションを使用
 * これはZodパターンとして許容される（外部ライブラリの型要件）
 */
export function getSafeConfig<T extends PageSectionType>(
  type: T,
  config: unknown
): z.output<SectionConfigSchemas[T]> {
  const schema = sectionConfigSchemas[type]
  const result = schema.safeParse(config)
  if (result.success) {
    // Zodの型推論制約: schema.safeParseの結果型がジェネリックTと連動しない
    return result.data as z.output<SectionConfigSchemas[T]>
  }
  return defaultSectionConfigs[type] as z.output<SectionConfigSchemas[T]>
}

// =============================================================================
// Select値バリデーター（型アサーション不要）
// =============================================================================

/**
 * Select onValueChange 用の型安全バリデーター
 *
 * shadcn/ui Select は string を返すが、フォームは特定のunion型を期待する。
 * Zodスキーマでバリデートすることで型安全に変換する。
 */

// 共通のenum値スキーマを抽出
const heroHeightSchema = z.enum(['sm', 'md', 'lg', 'full'])
const maxWidthOptionsSchema = z.enum(['sm', 'md', 'lg', 'xl', 'full'])
const paddingOptionsSchema = z.enum(['none', 'sm', 'md', 'lg'])
const spaceLayoutOptionsSchema = z.enum(['grid', 'list', 'carousel'])
const newsLayoutOptionsSchema = z.enum(['list', 'card'])
const postLayoutOptionsSchema = z.enum(['grid', 'list'])
const ctaVariantOptionsSchema = z.enum(['default', 'centered', 'split'])

/** Hero高さオプションのバリデーター */
export function parseHeroHeight(value: string): HeroConfig['height'] {
  const result = heroHeightSchema.safeParse(value)
  return result.success ? result.data : 'md'
}

/** 最大幅オプションのバリデーター */
export function parseMaxWidth(value: string): CustomConfig['maxWidth'] {
  const result = maxWidthOptionsSchema.safeParse(value)
  return result.success ? result.data : 'lg'
}

/** パディングオプションのバリデーター */
export function parsePadding(value: string): CustomConfig['padding'] {
  const result = paddingOptionsSchema.safeParse(value)
  return result.success ? result.data : 'md'
}

/** スペースレイアウトオプションのバリデーター（3種: grid, list, carousel） */
export function parseSpaceLayout(value: string): SpaceListConfig['layout'] {
  const result = spaceLayoutOptionsSchema.safeParse(value)
  return result.success ? result.data : 'grid'
}

/** ニュースレイアウトオプションのバリデーター（2種: list, card） */
export function parseNewsLayout(value: string): NewsListConfig['layout'] {
  const result = newsLayoutOptionsSchema.safeParse(value)
  return result.success ? result.data : 'list'
}

/** 投稿レイアウトオプションのバリデーター（2種: grid, list） */
export function parsePostLayout(value: string): PostListConfig['layout'] {
  const result = postLayoutOptionsSchema.safeParse(value)
  return result.success ? result.data : 'grid'
}

/** CTAバリアントオプションのバリデーター（3種: default, centered, split） */
export function parseCtaVariant(value: string): CtaConfig['variant'] {
  const result = ctaVariantOptionsSchema.safeParse(value)
  return result.success ? result.data : 'default'
}

// =============================================================================
// デフォルト設定
// =============================================================================

/**
 * セクションタイプ別デフォルト設定
 */
export const defaultSectionConfigs: {
  [K in PageSectionType]: z.infer<SectionConfigSchemas[K]>
} = {
  [PageSectionType.HERO]: {
    title: '',
    subtitle: '',
    backgroundImageUrl: '',
    buttons: [],
    height: 'md',
    overlay: true,
    overlayOpacity: 40,
    variant: 'default',
    parallaxSpeed: 0.5,
    ...defaultDesignParams,
  },
  [PageSectionType.CUSTOM]: {
    maxWidth: 'lg',
    containerClass: '',
    padding: 'md',
    ...defaultDesignParams,
  },
  [PageSectionType.CONTACT_FORM]: {
    title: 'お問い合わせ',
    showNameField: true,
    showPhoneField: true,
    showSubjectField: true,
    submitButtonText: '送信する',
    variant: 'default',
    ...defaultDesignParams,
  },
  [PageSectionType.FAQ_LIST]: {
    title: 'よくあるご質問',
    maxItems: 10,
    showViewAllLink: true,
    variant: 'default',
    ...defaultDesignParams,
  },
  [PageSectionType.SPACE_LIST]: {
    title: 'スペース一覧',
    maxItems: 6,
    showOnlyPublished: true,
    showViewAllLink: true,
    layout: 'grid',
    columns: 3,
    ...defaultDesignParams,
  },
  [PageSectionType.NEWS_LIST]: {
    title: 'お知らせ',
    maxItems: 5,
    showViewAllLink: true,
    layout: 'list',
    ...defaultDesignParams,
  },
  [PageSectionType.POST_LIST]: {
    title: '最新の記事',
    maxItems: 6,
    showViewAllLink: true,
    layout: 'grid',
    columns: 3,
    ...defaultDesignParams,
  },
  [PageSectionType.CTA]: {
    title: 'ご予約・お問い合わせ',
    buttons: [
      { text: '予約する', url: '/reservation', variant: 'primary', size: 'lg', openInNewTab: false },
      { text: 'お問い合わせ', url: '/contact', variant: 'secondary', size: 'lg', openInNewTab: false },
    ],
    variant: 'default',
    ...defaultDesignParams,
  },
  [PageSectionType.GALLERY]: {
    images: [],
    layout: 'grid',
    columns: 3,
    gap: 'md',
    enableLightbox: true,
    ...defaultDesignParams,
  },
  [PageSectionType.TESTIMONIAL]: {
    title: 'お客様の声',
    items: [],
    layout: 'carousel',
    showRating: true,
    variant: 'default',
    ...defaultDesignParams,
  },
  [PageSectionType.MAP]: {
    zoom: 15,
    height: 'md',
    showAddressBelow: true,
    ...defaultDesignParams,
  },
  [PageSectionType.EMBED]: {
    aspectRatio: '16:9',
    maxWidth: 'lg',
    ...defaultDesignParams,
  },
}

/**
 * セクションタイプの表示名
 */
export const sectionTypeLabels: Record<PageSectionType, string> = {
  [PageSectionType.HERO]: 'ヒーロー',
  [PageSectionType.CUSTOM]: 'カスタム',
  [PageSectionType.CONTACT_FORM]: 'お問い合わせフォーム',
  [PageSectionType.FAQ_LIST]: 'よくあるご質問',
  [PageSectionType.SPACE_LIST]: 'スペース一覧',
  [PageSectionType.NEWS_LIST]: 'お知らせ一覧',
  [PageSectionType.POST_LIST]: '記事一覧',
  [PageSectionType.CTA]: 'CTA（行動喚起）',
  [PageSectionType.GALLERY]: 'ギャラリー',
  [PageSectionType.TESTIMONIAL]: '体験談・レビュー',
  [PageSectionType.MAP]: '地図',
  [PageSectionType.EMBED]: '埋め込み',
}

/**
 * セクションタイプの説明
 */
export const sectionTypeDescriptions: Record<PageSectionType, string> = {
  [PageSectionType.HERO]: 'ページ上部に表示する大きなバナー。背景画像とCTAボタンを配置できます。',
  [PageSectionType.CUSTOM]: 'Lexicalエディタで自由にコンテンツを作成できます。',
  [PageSectionType.CONTACT_FORM]: 'お問い合わせフォームを表示します。',
  [PageSectionType.FAQ_LIST]: 'よくある質問と回答をアコーディオン形式で表示します。',
  [PageSectionType.SPACE_LIST]: 'スペース一覧をグリッド形式で表示します。',
  [PageSectionType.NEWS_LIST]: 'お知らせ一覧を表示します。',
  [PageSectionType.POST_LIST]: 'ブログ記事一覧を表示します。',
  [PageSectionType.CTA]: '行動喚起セクション。予約やお問い合わせへの導線を配置します。',
  [PageSectionType.GALLERY]: '画像ギャラリーを表示します。',
  [PageSectionType.TESTIMONIAL]: 'お客様の声やレビューを表示します。',
  [PageSectionType.MAP]: 'Google Mapsで位置情報を表示します。',
  [PageSectionType.EMBED]: 'YouTubeやGoogleフォームなどの外部コンテンツを埋め込みます。',
}

/**
 * セクションタイプのアイコン名（Lucide React）
 */
export const sectionTypeIcons: Record<PageSectionType, string> = {
  [PageSectionType.HERO]: 'Image',
  [PageSectionType.CUSTOM]: 'FileText',
  [PageSectionType.CONTACT_FORM]: 'Mail',
  [PageSectionType.FAQ_LIST]: 'HelpCircle',
  [PageSectionType.SPACE_LIST]: 'LayoutGrid',
  [PageSectionType.NEWS_LIST]: 'Newspaper',
  [PageSectionType.POST_LIST]: 'FileEdit',
  [PageSectionType.CTA]: 'MousePointerClick',
  [PageSectionType.GALLERY]: 'Images',
  [PageSectionType.TESTIMONIAL]: 'Quote',
  [PageSectionType.MAP]: 'MapPin',
  [PageSectionType.EMBED]: 'Code',
}
