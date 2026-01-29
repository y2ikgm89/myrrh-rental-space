/**
 * ホームページセクション バリデーションスキーマ
 *
 * 各セクションタイプに応じた設定スキーマを定義
 * Zod discriminated union で型安全なJSON config を実現
 *
 * admin/public両方で使用
 */

import { z } from 'zod'
import { HomepageSectionType } from '@/shared/generated/prisma/enums'
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

export { HomepageSectionType }
export { animationSchema, responsiveSchema, spacingSchema }
export type { CTAButtonItem } from './section-design'
export { ctaButtonVariants, ctaButtonSizes } from './section-design'

// =============================================================================
// 共通スキーマ（URL最大200文字）
// =============================================================================

const safeUrlSchema = createSafeUrlSchema(200)
const { ctaButtonSchema, optionalCtaButtonSchema } = createCtaSchemas(safeUrlSchema)
const ctaButtonItemSchema = createCtaButtonItemSchema(safeUrlSchema)

// =============================================================================
// セクションタイプ別設定スキーマ
// =============================================================================

/**
 * Hero セクション設定（入力スキーマ）
 * レガシー ctaPrimary/ctaSecondary と新 buttons[] の両方を受容
 */
const heroConfigRawSchema = z.object({
  title: z.string().min(1, { error: 'タイトルは必須です' }).max(100, { error: 'タイトルは100文字以内です' }),
  subtitle: z.string().max(300, { error: 'サブタイトルは300文字以内です' }).optional(),
  backgroundImageUrl: z.string().url({ error: '有効なURLを入力してください' }).optional().or(z.literal('')),
  // NEW: ボタン配列
  buttons: z.array(ctaButtonItemSchema).optional(),
  // LEGACY: 入力のみ受容
  ctaPrimary: ctaButtonSchema.optional(),
  ctaSecondary: optionalCtaButtonSchema,
  // バリアント
  variant: z.enum(['default', 'minimal', 'split', 'video', 'parallax']).default('default'),
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
 * SpaceList セクション設定
 */
export const spaceListConfigSchema = z.object({
  maxItems: z.number().int().min(1).max(12).default(6),
  showOnlyPublished: z.boolean().default(true),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * News セクション設定
 */
export const newsConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('お知らせ'),
  maxItems: z.number().int().min(1).max(10).default(3),
  showViewAllLink: z.boolean().default(true),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * Posts セクション設定
 */
export const postsConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('最新の記事'),
  maxItems: z.number().int().min(1).max(10).default(3),
  showViewAllLink: z.boolean().default(true),
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * FAQ セクション設定
 * - categoryId指定: 特定カテゴリのFAQを表示
 * - items指定: カスタムFAQ項目（Lexicalで編集）
 */
export const faqConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('よくあるご質問'),
  categoryId: z.string().uuid().optional(), // FaqCategory参照
  maxItems: z.number().int().min(1).max(20).default(5),
  items: z
    .array(
      z.object({
        question: z.string().min(1, { error: '質問は必須です' }).max(200, { error: '質問は200文字以内です' }),
        answer: z.string().min(1, { error: '回答は必須です' }).max(5000, { error: '回答は5000文字以内です' }),
      })
    )
    .optional(), // カスタムFAQ（categoryIdと排他的に使用）
  // バリアント
  variant: z.enum(['default', 'bordered', 'minimal']).default('default'),
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
  // バリアント
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
 * Custom セクション設定
 * - contentフィールドにLexical HTMLを格納
 * - configは最小限の設定のみ
 */
export const customConfigSchema = z.object({
  // カスタムセクションは content フィールドを使用するため設定は最小限
  containerClass: z.string().max(200).optional(), // 追加CSSクラス
  // デザインパラメータ
  animation: animationSchema,
  responsive: responsiveSchema,
  spacing: spacingSchema,
  customClass: z.string().max(200).default(''),
})

/**
 * Instagram セクション設定
 * - 管理画面で設定したInstagramフィードを表示
 */
export const instagramConfigSchema = z.object({
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).default('Instagram'),
  // フィードの詳細設定は管理画面のInstagram設定で管理
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
  [HomepageSectionType.HERO]: heroConfigSchema,
  [HomepageSectionType.SPACE_LIST]: spaceListConfigSchema,
  [HomepageSectionType.NEWS]: newsConfigSchema,
  [HomepageSectionType.POST]: postsConfigSchema,
  [HomepageSectionType.FAQ]: faqConfigSchema,
  [HomepageSectionType.CTA]: ctaConfigSchema,
  [HomepageSectionType.CUSTOM]: customConfigSchema,
  [HomepageSectionType.INSTAGRAM]: instagramConfigSchema,
} satisfies Record<HomepageSectionType, z.ZodType>

/**
 * セクションタイプに応じた設定を検証
 */
export function validateSectionConfig(type: HomepageSectionType, config: unknown) {
  const schema = sectionConfigSchemas[type]
  return schema.safeParse(config)
}

/**
 * ホームページセクション作成スキーマ
 */
export const createHomepageSectionSchema = z.object({
  type: z.nativeEnum(HomepageSectionType),
  title: z.string().max(100, { error: 'タイトルは100文字以内です' }).optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  content: z.string().max(500000, { error: 'コンテンツは500,000文字以内です' }).optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
})

/**
 * ホームページセクション更新スキーマ
 */
export const updateHomepageSectionSchema = z.object({
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
export type HeroConfig = z.infer<typeof heroConfigSchema>
export type SpaceListConfig = z.infer<typeof spaceListConfigSchema>
export type NewsConfig = z.infer<typeof newsConfigSchema>
export type PostsConfig = z.infer<typeof postsConfigSchema>
export type FaqConfig = z.infer<typeof faqConfigSchema>
export type CtaConfig = z.infer<typeof ctaConfigSchema>
export type CustomConfig = z.infer<typeof customConfigSchema>
export type InstagramConfig = z.infer<typeof instagramConfigSchema>

// Input types (フォーム入力用、optional fieldsを含む)
// React Hook Form + zodResolverで使用する際の推奨パターン
// See: https://github.com/react-hook-form/resolvers/issues/800
export type HeroConfigInput = z.input<typeof heroConfigSchema>
export type SpaceListConfigInput = z.input<typeof spaceListConfigSchema>
export type NewsConfigInput = z.input<typeof newsConfigSchema>
export type PostsConfigInput = z.input<typeof postsConfigSchema>
export type FaqConfigInput = z.input<typeof faqConfigSchema>
export type CtaConfigInput = z.input<typeof ctaConfigSchema>
export type CustomConfigInput = z.input<typeof customConfigSchema>
export type InstagramConfigInput = z.input<typeof instagramConfigSchema>

export type SectionConfig =
  | HeroConfig
  | SpaceListConfig
  | NewsConfig
  | PostsConfig
  | FaqConfig
  | CtaConfig
  | CustomConfig
  | InstagramConfig

export type CreateHomepageSectionInput = z.infer<typeof createHomepageSectionSchema>
export type UpdateHomepageSectionInput = z.infer<typeof updateHomepageSectionSchema>
export type UpdateSectionOrderInput = z.infer<typeof updateSectionOrderSchema>

// =============================================================================
// 型ガード関数
// =============================================================================

/**
 * HeroConfig型ガード
 */
export function isHeroConfig(config: unknown): config is HeroConfig {
  return heroConfigSchema.safeParse(config).success
}

/**
 * SpaceListConfig型ガード
 */
export function isSpaceListConfig(config: unknown): config is SpaceListConfig {
  return spaceListConfigSchema.safeParse(config).success
}

/**
 * NewsConfig型ガード
 */
export function isNewsConfig(config: unknown): config is NewsConfig {
  return newsConfigSchema.safeParse(config).success
}

/**
 * PostsConfig型ガード
 */
export function isPostsConfig(config: unknown): config is PostsConfig {
  return postsConfigSchema.safeParse(config).success
}

/**
 * FaqConfig型ガード
 */
export function isFaqConfig(config: unknown): config is FaqConfig {
  return faqConfigSchema.safeParse(config).success
}

/**
 * CtaConfig型ガード
 */
export function isCtaConfig(config: unknown): config is CtaConfig {
  return ctaConfigSchema.safeParse(config).success
}

/**
 * CustomConfig型ガード
 */
export function isCustomConfig(config: unknown): config is CustomConfig {
  return customConfigSchema.safeParse(config).success
}

/**
 * InstagramConfig型ガード
 */
export function isInstagramConfig(config: unknown): config is InstagramConfig {
  return instagramConfigSchema.safeParse(config).success
}

/**
 * セクションタイプに応じたconfig取得（型安全）
 * バリデーション失敗時はデフォルト値を返す
 *
 * 注: 型推論の限界により、呼び出し側では型特化ヘルパー関数の使用を推奨
 * @see getHeroConfig, getCtaConfig, etc.
 */
export function getSafeConfig<T extends HomepageSectionType>(
  type: T,
  config: unknown
): SectionConfig {
  const result = validateSectionConfig(type, config)
  if (result.success) {
    return result.data
  }
  // バリデーション失敗時はデフォルト値を返す
  return defaultSectionConfigs[type]
}

// =============================================================================
// 型特化ヘルパー関数（型アサーション不要）
// =============================================================================

/**
 * 汎用configゲッターファクトリ
 * safeParse成功時はパース結果を、失敗時はデフォルト値を返す
 * Note: defaultSectionConfigsは後で定義されるが、ゲッター呼び出し時には初期化済み
 */
function createConfigGetter<T>(
  schema: z.ZodType<T>,
  getDefault: () => unknown,
) {
  let cached: T | undefined
  return (config: unknown): T => {
    const result = schema.safeParse(config)
    if (result.success) return result.data
    return (cached ??= schema.parse(getDefault()))
  }
}

export const getHeroConfig = createConfigGetter(heroConfigSchema, () => defaultSectionConfigs[HomepageSectionType.HERO])
export const getSpaceListConfig = createConfigGetter(spaceListConfigSchema, () => defaultSectionConfigs[HomepageSectionType.SPACE_LIST])
export const getNewsConfig = createConfigGetter(newsConfigSchema, () => defaultSectionConfigs[HomepageSectionType.NEWS])
export const getPostsConfig = createConfigGetter(postsConfigSchema, () => defaultSectionConfigs[HomepageSectionType.POST])
export const getFaqConfig = createConfigGetter(faqConfigSchema, () => defaultSectionConfigs[HomepageSectionType.FAQ])
export const getCtaConfig = createConfigGetter(ctaConfigSchema, () => defaultSectionConfigs[HomepageSectionType.CTA])
export const getCustomConfig = createConfigGetter(customConfigSchema, () => defaultSectionConfigs[HomepageSectionType.CUSTOM])
export const getInstagramConfig = createConfigGetter(instagramConfigSchema, () => defaultSectionConfigs[HomepageSectionType.INSTAGRAM])

// =============================================================================
// デフォルト設定
// =============================================================================

/**
 * セクションタイプ別デフォルト設定
 */
export const defaultSectionConfigs: Record<HomepageSectionType, SectionConfig> = {
  [HomepageSectionType.HERO]: {
    title: '理想のスペースを、あなたに。',
    subtitle: '',
    backgroundImageUrl: '',
    buttons: [
      { text: 'スペースを探す', url: '/spaces', variant: 'primary', size: 'lg', openInNewTab: false },
      { text: 'お問い合わせ', url: '/contact', variant: 'secondary', size: 'lg', openInNewTab: false },
    ],
    variant: 'default',
    ...defaultDesignParams,
  },
  [HomepageSectionType.SPACE_LIST]: {
    maxItems: 6,
    showOnlyPublished: true,
    ...defaultDesignParams,
  },
  [HomepageSectionType.NEWS]: {
    title: 'お知らせ',
    maxItems: 3,
    showViewAllLink: true,
    ...defaultDesignParams,
  },
  [HomepageSectionType.POST]: {
    title: '最新の記事',
    maxItems: 3,
    showViewAllLink: true,
    ...defaultDesignParams,
  },
  [HomepageSectionType.FAQ]: {
    title: 'よくあるご質問',
    maxItems: 5,
    items: [],
    variant: 'default',
    ...defaultDesignParams,
  },
  [HomepageSectionType.CTA]: {
    title: 'ご予約・お問い合わせ',
    description: '',
    buttons: [
      { text: '予約する', url: '/reservation', variant: 'primary', size: 'lg', openInNewTab: false },
      { text: 'お問い合わせ', url: '/contact', variant: 'secondary', size: 'lg', openInNewTab: false },
    ],
    variant: 'default',
    ...defaultDesignParams,
  },
  [HomepageSectionType.CUSTOM]: {
    containerClass: '',
    ...defaultDesignParams,
  },
  [HomepageSectionType.INSTAGRAM]: {
    title: 'Instagram',
    ...defaultDesignParams,
  },
}

/**
 * セクションタイプの表示名
 */
export const sectionTypeLabels: Record<HomepageSectionType, string> = {
  [HomepageSectionType.HERO]: 'ヒーロー',
  [HomepageSectionType.SPACE_LIST]: 'スペース一覧',
  [HomepageSectionType.NEWS]: 'お知らせ',
  [HomepageSectionType.POST]: 'ブログ',
  [HomepageSectionType.FAQ]: 'よくあるご質問',
  [HomepageSectionType.CTA]: 'CTA（行動喚起）',
  [HomepageSectionType.CUSTOM]: 'カスタム',
  [HomepageSectionType.INSTAGRAM]: 'Instagram',
}

/**
 * セクションタイプのデフォルト順序
 */
export const defaultSectionOrder: HomepageSectionType[] = [
  HomepageSectionType.HERO,
  HomepageSectionType.SPACE_LIST,
  HomepageSectionType.NEWS,
  HomepageSectionType.POST,
  HomepageSectionType.FAQ,
  HomepageSectionType.CTA,
]
