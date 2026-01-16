import { z } from 'zod'
import { HomepageSectionType } from '@/generated/prisma/client/enums'

export { HomepageSectionType }

/**
 * ホームページセクション バリデーションスキーマ
 *
 * 各セクションタイプに応じた設定スキーマを定義
 * Zod discriminated union で型安全なJSON config を実現
 */

// =============================================================================
// 共通スキーマ
// =============================================================================

/**
 * URL検証: 内部パス（/で始まる）またはhttp/httpsのみ許可
 */
const safeUrlSchema = z
  .string()
  .max(200, 'URLは200文字以内です')
  .refine(
    (url) => url === '' || url.startsWith('/') || url.startsWith('http://') || url.startsWith('https://'),
    '有効なURLまたはパス（/で始まる）を入力してください'
  )

/**
 * CTAボタン設定
 */
const ctaButtonSchema = z.object({
  text: z.string().min(1, 'ボタンテキストは必須です').max(50, 'ボタンテキストは50文字以内です'),
  url: safeUrlSchema,
})

const optionalCtaButtonSchema = z
  .object({
    text: z.string().max(50, 'ボタンテキストは50文字以内です').optional(),
    url: safeUrlSchema.optional(),
  })
  .optional()

// =============================================================================
// セクションタイプ別設定スキーマ
// =============================================================================

/**
 * Hero セクション設定
 */
export const heroConfigSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(100, 'タイトルは100文字以内です'),
  subtitle: z.string().max(300, 'サブタイトルは300文字以内です').optional(),
  backgroundImageUrl: z.string().url('有効なURLを入力してください').optional().or(z.literal('')),
  ctaPrimary: ctaButtonSchema,
  ctaSecondary: optionalCtaButtonSchema,
})

/**
 * SpaceList セクション設定
 */
export const spaceListConfigSchema = z.object({
  maxItems: z.number().int().min(1).max(12).default(6),
  showOnlyPublished: z.boolean().default(true),
})

/**
 * News セクション設定
 */
export const newsConfigSchema = z.object({
  title: z.string().max(100, 'タイトルは100文字以内です').default('お知らせ'),
  maxItems: z.number().int().min(1).max(10).default(3),
  showViewAllLink: z.boolean().default(true),
})

/**
 * Blog セクション設定
 */
export const blogConfigSchema = z.object({
  title: z.string().max(100, 'タイトルは100文字以内です').default('最新の記事'),
  maxItems: z.number().int().min(1).max(10).default(3),
  showViewAllLink: z.boolean().default(true),
})

/**
 * FAQ セクション設定
 * - categoryId指定: 特定カテゴリのFAQを表示
 * - items指定: カスタムFAQ項目（Lexicalで編集）
 */
export const faqConfigSchema = z.object({
  title: z.string().max(100, 'タイトルは100文字以内です').default('よくあるご質問'),
  categoryId: z.string().uuid().optional(), // FaqCategory参照
  maxItems: z.number().int().min(1).max(20).default(5),
  items: z
    .array(
      z.object({
        question: z.string().min(1, '質問は必須です').max(200, '質問は200文字以内です'),
        answer: z.string().min(1, '回答は必須です').max(5000, '回答は5000文字以内です'),
      })
    )
    .optional(), // カスタムFAQ（categoryIdと排他的に使用）
})

/**
 * CTA セクション設定
 */
export const ctaConfigSchema = z.object({
  title: z.string().min(1, 'タイトルは必須です').max(100, 'タイトルは100文字以内です'),
  description: z.string().max(500, '説明は500文字以内です').optional(),
  ctaPrimary: ctaButtonSchema,
  ctaSecondary: optionalCtaButtonSchema,
})

/**
 * Custom セクション設定
 * - contentフィールドにLexical HTMLを格納
 * - configは最小限の設定のみ
 */
export const customConfigSchema = z.object({
  // カスタムセクションは content フィールドを使用するため設定は最小限
  containerClass: z.string().max(200).optional(), // 追加CSSクラス
})

// =============================================================================
// 統合スキーマ
// =============================================================================

/**
 * セクションタイプ → 設定スキーマのマッピング
 */
export const sectionConfigSchemas: Record<
  HomepageSectionType,
  | typeof heroConfigSchema
  | typeof spaceListConfigSchema
  | typeof newsConfigSchema
  | typeof blogConfigSchema
  | typeof faqConfigSchema
  | typeof ctaConfigSchema
  | typeof customConfigSchema
> = {
  [HomepageSectionType.HERO]: heroConfigSchema,
  [HomepageSectionType.SPACE_LIST]: spaceListConfigSchema,
  [HomepageSectionType.NEWS]: newsConfigSchema,
  [HomepageSectionType.BLOG]: blogConfigSchema,
  [HomepageSectionType.FAQ]: faqConfigSchema,
  [HomepageSectionType.CTA]: ctaConfigSchema,
  [HomepageSectionType.CUSTOM]: customConfigSchema,
}

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
  title: z.string().max(100, 'タイトルは100文字以内です').optional(),
  config: z.record(z.string(), z.unknown()).default({}),
  content: z.string().max(500000, 'コンテンツは500,000文字以内です').optional(),
  order: z.number().int().min(0).optional(),
  isActive: z.boolean().default(true),
})

/**
 * ホームページセクション更新スキーマ
 */
export const updateHomepageSectionSchema = z.object({
  title: z.string().max(100, 'タイトルは100文字以内です').optional(),
  config: z.record(z.string(), z.unknown()).optional(),
  content: z.string().max(500000, 'コンテンツは500,000文字以内です').optional(),
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
export type BlogConfig = z.infer<typeof blogConfigSchema>
export type FaqConfig = z.infer<typeof faqConfigSchema>
export type CtaConfig = z.infer<typeof ctaConfigSchema>
export type CustomConfig = z.infer<typeof customConfigSchema>

// Input types (フォーム入力用、optional fieldsを含む)
// React Hook Form + zodResolverで使用する際の推奨パターン
// See: https://github.com/react-hook-form/resolvers/issues/800
export type SpaceListConfigInput = z.input<typeof spaceListConfigSchema>
export type NewsConfigInput = z.input<typeof newsConfigSchema>
export type BlogConfigInput = z.input<typeof blogConfigSchema>
export type FaqConfigInput = z.input<typeof faqConfigSchema>

export type SectionConfig =
  | HeroConfig
  | SpaceListConfig
  | NewsConfig
  | BlogConfig
  | FaqConfig
  | CtaConfig
  | CustomConfig

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
 * BlogConfig型ガード
 */
export function isBlogConfig(config: unknown): config is BlogConfig {
  return blogConfigSchema.safeParse(config).success
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
 * セクションタイプに応じたconfig取得（型安全）
 * バリデーション失敗時はデフォルト値を返す
 */
export function getSafeConfig<T extends HomepageSectionType>(
  type: T,
  config: unknown
): T extends typeof HomepageSectionType.HERO ? HeroConfig
  : T extends typeof HomepageSectionType.SPACE_LIST ? SpaceListConfig
  : T extends typeof HomepageSectionType.NEWS ? NewsConfig
  : T extends typeof HomepageSectionType.BLOG ? BlogConfig
  : T extends typeof HomepageSectionType.FAQ ? FaqConfig
  : T extends typeof HomepageSectionType.CTA ? CtaConfig
  : T extends typeof HomepageSectionType.CUSTOM ? CustomConfig
  : SectionConfig {
  const result = validateSectionConfig(type, config)
  if (result.success) {
    return result.data as ReturnType<typeof getSafeConfig<T>>
  }
  // バリデーション失敗時はデフォルト値を返す
  return defaultSectionConfigs[type] as ReturnType<typeof getSafeConfig<T>>
}

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
    ctaPrimary: { text: 'スペースを探す', url: '/spaces' },
    ctaSecondary: { text: 'お問い合わせ', url: '/contact' },
  },
  [HomepageSectionType.SPACE_LIST]: {
    maxItems: 6,
    showOnlyPublished: true,
  },
  [HomepageSectionType.NEWS]: {
    title: 'お知らせ',
    maxItems: 3,
    showViewAllLink: true,
  },
  [HomepageSectionType.BLOG]: {
    title: '最新の記事',
    maxItems: 3,
    showViewAllLink: true,
  },
  [HomepageSectionType.FAQ]: {
    title: 'よくあるご質問',
    maxItems: 5,
    items: [],
  },
  [HomepageSectionType.CTA]: {
    title: 'ご予約・お問い合わせ',
    description: '',
    ctaPrimary: { text: '予約する', url: '/reservation' },
    ctaSecondary: { text: 'お問い合わせ', url: '/contact' },
  },
  [HomepageSectionType.CUSTOM]: {
    containerClass: '',
  },
}

/**
 * セクションタイプの表示名
 */
export const sectionTypeLabels: Record<HomepageSectionType, string> = {
  [HomepageSectionType.HERO]: 'ヒーロー',
  [HomepageSectionType.SPACE_LIST]: 'スペース一覧',
  [HomepageSectionType.NEWS]: 'お知らせ',
  [HomepageSectionType.BLOG]: 'ブログ',
  [HomepageSectionType.FAQ]: 'よくあるご質問',
  [HomepageSectionType.CTA]: 'CTA（行動喚起）',
  [HomepageSectionType.CUSTOM]: 'カスタム',
}

/**
 * セクションタイプのデフォルト順序
 */
export const defaultSectionOrder: HomepageSectionType[] = [
  HomepageSectionType.HERO,
  HomepageSectionType.SPACE_LIST,
  HomepageSectionType.NEWS,
  HomepageSectionType.BLOG,
  HomepageSectionType.FAQ,
  HomepageSectionType.CTA,
]
