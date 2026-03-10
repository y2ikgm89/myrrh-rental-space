/**
 * セクション共通スキーマ
 *
 * section.ts で使用
 * URL / CTA ボタン / HEXカラーバリデーション / デザイン設定
 */

import { z } from "zod";
import { textAlignValues } from "./section-options";

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
        url === "" ||
        url.startsWith("/") ||
        url.startsWith("http://") ||
        url.startsWith("https://"),
      { error: "有効なURLまたはパス（/で始まる）を入力してください" },
    );
}

/**
 * CTAボタン設定（レガシー: ctaPrimary/ctaSecondary 用）
 */
export function createCtaSchemas(urlSchema: z.ZodType<string>) {
  const ctaButtonSchema = z.object({
    text: z
      .string()
      .min(1, { error: "ボタンテキストは必須です" })
      .max(50, { error: "ボタンテキストは50文字以内です" }),
    url: urlSchema,
  });

  const optionalCtaButtonSchema = z
    .object({
      text: z
        .string()
        .max(50, { error: "ボタンテキストは50文字以内です" })
        .optional(),
      url: urlSchema.optional(),
    })
    .optional();

  return { ctaButtonSchema, optionalCtaButtonSchema };
}

// =============================================================================
// HEXカラーバリデーション
// =============================================================================

const HEX_COLOR_REGEX = /^#[0-9A-Fa-f]{6}$/;

/**
 * オプショナルHEXカラースキーマ
 * 空文字列 → undefined に変換、非空ならHEX形式を検証
 */
export const optionalHexColorSchema = z
  .string()
  .refine((val) => val === "" || HEX_COLOR_REGEX.test(val), {
    error: "HEXカラー形式（#RRGGBB）で入力してください",
  })
  .transform((val) => val || undefined)
  .optional();

/**
 * HEXカラー値の簡易バリデーション（null/undefined/空文字はtrue）
 */
export function isValidHexColor(value: string | null | undefined): boolean {
  if (!value) return true;
  return HEX_COLOR_REGEX.test(value);
}

// =============================================================================
// CTAボタン配列スキーマ（新API）
// =============================================================================

/** ボタンバリアント */
export const ctaButtonVariants = [
  "primary",
  "secondary",
  "outline",
  "ghost",
] as const;
export type CTAButtonVariant = (typeof ctaButtonVariants)[number];

/** ボタンサイズ */
export const ctaButtonSizes = ["sm", "md", "lg"] as const;
export type CTAButtonSize = (typeof ctaButtonSizes)[number];

/**
 * CTAボタン配列アイテムスキーマファクトリ
 */
export function createCtaButtonItemSchema(urlSchema: z.ZodType<string>) {
  return z.object({
    text: z
      .string()
      .min(1, { error: "ボタンテキストは必須です" })
      .max(50, { error: "ボタンテキストは50文字以内です" }),
    url: urlSchema,
    variant: z.enum(ctaButtonVariants).default("primary"),
    size: z.enum(ctaButtonSizes).default("lg"),
    openInNewTab: z.boolean().default(false),
    backgroundColor: optionalHexColorSchema,
    textColor: optionalHexColorSchema,
  });
}

/**
 * CTAボタン配列アイテムの出力型
 */
export type CTAButtonItem = {
  text: string;
  url: string;
  variant: CTAButtonVariant;
  size: CTAButtonSize;
  openInNewTab: boolean;
  backgroundColor?: string | undefined;
  textColor?: string | undefined;
};

/**
 * レガシーCTAフィールド（ctaPrimary/ctaSecondary）→ buttons[] に変換
 */
export function transformLegacyCtaToButtons(
  ctaPrimary?: { text: string; url: string } | undefined,
  ctaSecondary?:
    | { text?: string | undefined; url?: string | undefined }
    | undefined,
): CTAButtonItem[] {
  const buttons: CTAButtonItem[] = [];
  if (ctaPrimary?.text && ctaPrimary?.url) {
    buttons.push({
      text: ctaPrimary.text,
      url: ctaPrimary.url,
      variant: "primary",
      size: "lg",
      openInNewTab: false,
    });
  }
  if (ctaSecondary?.text && ctaSecondary?.url) {
    buttons.push({
      text: ctaSecondary.text,
      url: ctaSecondary.url,
      variant: "secondary",
      size: "lg",
      openInNewTab: false,
    });
  }
  return buttons;
}

/**
 * レガシーCTA → buttons[] 統一変換
 *
 * heroConfigSchema / ctaConfigSchema の .transform() で共通利用。
 * buttons[] が存在すればそのまま使用し、なければレガシーフィールドから変換する。
 *
 * Note: Return type is inferred by TypeScript as
 * `Omit<T, 'ctaPrimary' | 'ctaSecondary' | 'buttons'> & { buttons: CTAButtonItem[] }`
 * which is structurally equivalent to `Omit<T, 'ctaPrimary' | 'ctaSecondary'> & { buttons: CTAButtonItem[] }`.
 */
export function transformCtaFields<
  T extends {
    ctaPrimary?: { text: string; url: string } | undefined;
    ctaSecondary?:
      | { text?: string | undefined; url?: string | undefined }
      | undefined;
    buttons?: CTAButtonItem[] | undefined;
  },
>(input: T) {
  const { ctaPrimary, ctaSecondary, buttons, ...rest } = input;
  return {
    ...rest,
    buttons:
      buttons && buttons.length > 0
        ? buttons
        : transformLegacyCtaToButtons(ctaPrimary, ctaSecondary),
  };
}

// =============================================================================
// セクション design JSON スキーマ
// =============================================================================

/** セクション間隔 */
const sectionSpacingValues = ["none", "sm", "md", "lg", "xl"] as const;
export type SectionSpacing = (typeof sectionSpacingValues)[number];

/** 背景スタイル */
const sectionBgValues = [
  "default",
  "surface",
  "accent",
  "primary",
  "dark",
  "image",
  "gradient",
] as const;
export type SectionBg = (typeof sectionBgValues)[number];

/** コンテナ最大幅 */
const sectionMaxWidthValues = ["sm", "md", "lg", "xl", "full"] as const;
export type SectionMaxWidth = (typeof sectionMaxWidthValues)[number];

/** アニメーションプリセット */
const sectionAnimationValues = [
  "none",
  "fade",
  "slide-up",
  "parallax",
] as const;
export type SectionAnimation = (typeof sectionAnimationValues)[number];

const sectionAnimationSet = new Set<string>(sectionAnimationValues);

export function isSectionAnimation(value: string): value is SectionAnimation {
  return sectionAnimationSet.has(value);
}

/** タイトルサイズ */
export const titleSizeValues = ["sm", "md", "lg", "xl", "2xl", "3xl"] as const;
export type TitleSize = (typeof titleSizeValues)[number];

const titleSizeSet = new Set<string>(titleSizeValues);

export function isTitleSize(value: string): value is TitleSize {
  return titleSizeSet.has(value);
}

/** テキスト揃え（section-options.ts から import） */
export type { TextAlign } from "./section-options";

/**
 * セクション共通デザインスキーマ
 * Section.design JSON フィールドのバリデーション
 */
export const sectionDesignSchema = z.object({
  // 間隔
  paddingTop: z.enum(sectionSpacingValues).default("lg"),
  paddingBottom: z.enum(sectionSpacingValues).default("lg"),
  // 背景
  background: z.enum(sectionBgValues).default("default"),
  backgroundImageUrl: z.string().url().optional().or(z.literal("")),
  backgroundOverlayOpacity: z.number().min(0).max(100).default(0),
  // コンテナ
  maxWidth: z.enum(sectionMaxWidthValues).default("lg"),
  // テキストスタイリング
  titleColor: optionalHexColorSchema,
  titleSize: z.enum(titleSizeValues).default("lg"),
  textColor: optionalHexColorSchema,
  textAlign: z.enum(textAlignValues).default("left"),
  // アニメーション
  animation: z.enum(sectionAnimationValues).default("fade"),
  // カスタムCSS
  customClass: z.string().max(200).optional(),
});

export type SectionDesign = z.infer<typeof sectionDesignSchema>;
export type SectionDesignInput = z.input<typeof sectionDesignSchema>;

/** デフォルトデザイン設定 */
export const defaultSectionDesign: SectionDesign = {
  paddingTop: "lg",
  paddingBottom: "lg",
  background: "default",
  backgroundOverlayOpacity: 0,
  maxWidth: "lg",
  titleSize: "lg",
  textAlign: "left",
  animation: "fade",
};

/**
 * design JSON を安全にパース
 */
export function parseSectionDesign(value: unknown): SectionDesign {
  const result = sectionDesignSchema.safeParse(value);
  return result.success ? result.data : defaultSectionDesign;
}
