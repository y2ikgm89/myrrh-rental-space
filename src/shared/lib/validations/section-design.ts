/**
 * セクション共通デザインパラメータスキーマ
 *
 * homepage-section.ts と page-section.ts の両方で使用
 * アニメーション、レスポンシブ、スペーシング設定を共通化
 */

import { z } from 'zod'

// =============================================================================
// URL / CTAボタン共通スキーマ
// =============================================================================

/**
 * URL検証ファクトリ: 内部パス（/で始まる）またはhttp/httpsのみ許可
 */
export function createSafeUrlSchema(maxLength = 500) {
  return z
    .string()
    .max(maxLength, { error: `URLは${maxLength}文字以内です` })
    .refine(
      (url) =>
        url === '' ||
        url.startsWith('/') ||
        url.startsWith('http://') ||
        url.startsWith('https://'),
      { error: '有効なURLまたはパス（/で始まる）を入力してください' }
    )
}

/**
 * CTAボタン設定（レガシー: ctaPrimary/ctaSecondary 用）
 */
export function createCtaSchemas(urlSchema: z.ZodType<string>) {
  const ctaButtonSchema = z.object({
    text: z
      .string()
      .min(1, { error: 'ボタンテキストは必須です' })
      .max(50, { error: 'ボタンテキストは50文字以内です' }),
    url: urlSchema,
  })

  const optionalCtaButtonSchema = z
    .object({
      text: z
        .string()
        .max(50, { error: 'ボタンテキストは50文字以内です' })
        .optional(),
      url: urlSchema.optional(),
    })
    .optional()

  return { ctaButtonSchema, optionalCtaButtonSchema }
}

// =============================================================================
// HEXカラーバリデーション
// =============================================================================

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/

/**
 * オプショナルHEXカラースキーマ
 * 空文字列 → undefined に変換、非空ならHEX形式を検証
 */
export const optionalHexColorSchema = z
  .string()
  .refine((val) => val === '' || HEX_COLOR_REGEX.test(val), {
    error: 'HEXカラー形式（#RRGGBB）で入力してください',
  })
  .transform((val) => val || undefined)
  .optional()

/**
 * HEXカラー値の簡易バリデーション（null/undefined/空文字はtrue）
 */
export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return true
  return HEX_COLOR_REGEX.test(value)
}

// =============================================================================
// CTAボタン配列スキーマ（新API）
// =============================================================================

/** ボタンバリアント */
export const ctaButtonVariants = ['primary', 'secondary', 'outline', 'ghost'] as const
export type CTAButtonVariant = (typeof ctaButtonVariants)[number]

/** ボタンサイズ */
export const ctaButtonSizes = ['sm', 'md', 'lg'] as const
export type CTAButtonSize = (typeof ctaButtonSizes)[number]

/**
 * CTAボタン配列アイテムスキーマファクトリ
 */
export function createCtaButtonItemSchema(urlSchema: z.ZodType<string>) {
  return z.object({
    text: z
      .string()
      .min(1, { error: 'ボタンテキストは必須です' })
      .max(50, { error: 'ボタンテキストは50文字以内です' }),
    url: urlSchema,
    variant: z.enum(ctaButtonVariants).default('primary'),
    size: z.enum(ctaButtonSizes).default('lg'),
    openInNewTab: z.boolean().default(false),
    backgroundColor: optionalHexColorSchema,
    textColor: optionalHexColorSchema,
  })
}

/**
 * CTAボタン配列アイテムの出力型
 */
export type CTAButtonItem = {
  text: string
  url: string
  variant: CTAButtonVariant
  size: CTAButtonSize
  openInNewTab: boolean
  backgroundColor?: string
  textColor?: string
}

/**
 * レガシーCTAフィールド（ctaPrimary/ctaSecondary）→ buttons[] に変換
 */
export function transformLegacyCtaToButtons(
  ctaPrimary?: { text: string; url: string } | undefined,
  ctaSecondary?: { text?: string; url?: string } | undefined,
): CTAButtonItem[] {
  const buttons: CTAButtonItem[] = []
  if (ctaPrimary?.text && ctaPrimary?.url) {
    buttons.push({
      text: ctaPrimary.text,
      url: ctaPrimary.url,
      variant: 'primary',
      size: 'lg',
      openInNewTab: false,
    })
  }
  if (ctaSecondary?.text && ctaSecondary?.url) {
    buttons.push({
      text: ctaSecondary.text,
      url: ctaSecondary.url,
      variant: 'secondary',
      size: 'lg',
      openInNewTab: false,
    })
  }
  return buttons
}

/**
 * レガシーCTA → buttons[] 統一変換
 *
 * heroConfigSchema / ctaConfigSchema の .transform() で共通利用。
 * buttons[] が存在すればそのまま使用し、なければレガシーフィールドから変換する。
 *
 * Note: TypeScript cannot infer the rest spread type from a generic constraint,
 * so the type assertion is required (TypeScript generic rest spread limitation).
 */
export function transformCtaFields<
  T extends {
    ctaPrimary?: { text: string; url: string }
    ctaSecondary?: { text?: string; url?: string }
    buttons?: CTAButtonItem[]
  },
>(input: T): Omit<T, 'ctaPrimary' | 'ctaSecondary'> & { buttons: CTAButtonItem[] } {
  const { ctaPrimary, ctaSecondary, buttons, ...rest } = input
  // TypeScript generic rest spread limitation: cannot prove rest + buttons = Omit<T> & { buttons }
  return {
    ...rest,
    buttons: buttons && buttons.length > 0
      ? buttons
      : transformLegacyCtaToButtons(ctaPrimary, ctaSecondary),
  } as Omit<T, 'ctaPrimary' | 'ctaSecondary'> & { buttons: CTAButtonItem[] }
}

// =============================================================================
// 共通デザインパラメータ
// =============================================================================

/**
 * アニメーション設定
 * IntersectionObserver + CSS トランジションで実装
 */
export const animationSchema = z
  .object({
    type: z
      .enum(['none', 'fade', 'slide-up', 'slide-left', 'zoom'])
      .default('none'),
    duration: z.number().min(0).max(3000).default(600),
    delay: z.number().min(0).max(2000).default(0),
    easing: z
      .enum(['ease', 'ease-in', 'ease-out', 'ease-in-out', 'linear'])
      .default('ease-out'),
  })
  .default({ type: 'none', duration: 600, delay: 0, easing: 'ease-out' })

/**
 * レスポンシブ表示制御
 */
export const responsiveSchema = z
  .object({
    hideOnMobile: z.boolean().default(false),
    hideOnDesktop: z.boolean().default(false),
  })
  .default({ hideOnMobile: false, hideOnDesktop: false })

/**
 * スペーシング設定
 */
export const spacingSchema = z
  .object({
    paddingTop: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('md'),
    paddingBottom: z.enum(['none', 'sm', 'md', 'lg', 'xl']).default('md'),
  })
  .default({ paddingTop: 'md', paddingBottom: 'md' })

/**
 * デザインパラメータのデフォルト値
 */
export const defaultDesignParams = {
  animation: { type: 'none', duration: 600, delay: 0, easing: 'ease-out' },
  responsive: { hideOnMobile: false, hideOnDesktop: false },
  spacing: { paddingTop: 'md', paddingBottom: 'md' },
  customClass: '',
} satisfies DesignParams

// =============================================================================
// 型定義
// =============================================================================

export type AnimationConfig = z.output<typeof animationSchema>
export type ResponsiveConfig = z.output<typeof responsiveSchema>
export type SpacingConfig = z.output<typeof spacingSchema>

export interface DesignParams {
  animation: AnimationConfig
  responsive: ResponsiveConfig
  spacing: SpacingConfig
  customClass: string
}
