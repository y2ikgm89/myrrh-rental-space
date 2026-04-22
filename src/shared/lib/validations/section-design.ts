/**
 * セクション共通スキーマ
 *
 * section.ts で使用
 * URL / CTA ボタン / HEXカラーバリデーション / デザイン設定（旧API）
 *
 * Phase B.C1: URL/CTA/HEX helpers は cta-and-url.ts に移動済み。
 * このファイルは admin 画面（DesignFields.tsx 等）が使用する旧 SectionDesign 型を保持。
 * 新規コードは section-style.ts + SectionStylePayload を使用すること。
 */

import { z } from "zod";
import { textAlignValues } from "./section-options";
import { optionalHexColorSchema } from "./cta-and-url";

// =============================================================================
// URL / CTAボタン / HEXカラー helpers — cta-and-url.ts から re-export
// =============================================================================

export {
  createSafeUrlSchema,
  createCtaSchemas,
  createCtaButtonItemSchema,
  ctaButtonVariants,
  ctaButtonSizes,
  transformLegacyCtaToButtons,
  transformCtaFields,
  optionalHexColorSchema,
  isValidHexColor,
} from "./cta-and-url";

export type {
  CTAButtonVariant,
  CTAButtonSize,
  CTAButtonItem,
} from "./cta-and-url";

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
  "image",
] as const;
export type SectionBg = (typeof sectionBgValues)[number];

/** コンテナ最大幅 */
const sectionMaxWidthValues = [
  "sm",
  "md",
  "editorial",
  "lg",
  "xl",
  "full",
] as const;
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
