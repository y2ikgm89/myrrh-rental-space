/**
 * URL / CTA ボタン / HEXカラー バリデーションヘルパー
 *
 * section-design.ts から切り出した共通ユーティリティ。
 * section-style.ts および section.ts 両方から利用される。
 *
 * Phase B.C1 で新規作成（旧 section-design.ts の対応シンボルと同一実装）。
 */

import { z } from "zod";
import {
  isAppRoute,
  toAppRoute,
  type AppRoute,
} from "@/shared/lib/typed-routes";

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
 * 内部 application route 専用 URL スキーマ。
 *
 * 公開セクション CTA / 一覧導線は Next.js typedRoutes 前提で
 * `next/link` に渡すため、外部 URL と protocol-relative URL は保存時に拒否する。
 */
export function createInternalAppRouteSchema(maxLength = 500) {
  return z
    .string()
    .trim()
    .max(maxLength, { error: `URLは${maxLength}文字以内です` })
    .refine(isAppRoute, {
      error: "内部パス（/で始まり // ではないパス）を入力してください",
    })
    .transform((url) => toAppRoute(url));
}

export function createOptionalInternalAppRouteSchema(maxLength = 500) {
  return z
    .string()
    .trim()
    .max(maxLength, { error: `URLは${maxLength}文字以内です` })
    .refine((url) => url === "" || isAppRoute(url), {
      error: "内部パス（/で始まり // ではないパス）を入力してください",
    })
    .transform((url) => (url === "" ? "" : toAppRoute(url)));
}

/**
 * CTAボタン設定（レガシー: ctaPrimary/ctaSecondary 用）
 */
export function createCtaSchemas<
  TRequiredUrl extends string,
  TOptionalUrl extends string,
>(
  urlSchema: z.ZodType<TRequiredUrl>,
  optionalUrlSchema: z.ZodType<TOptionalUrl>,
) {
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
      url: optionalUrlSchema.optional(),
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
export function createCtaButtonItemSchema<TUrl extends string>(
  urlSchema: z.ZodType<TUrl>,
) {
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
  url: AppRoute;
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
  ctaPrimary?: { text: string; url: AppRoute } | undefined,
  ctaSecondary?:
    | { text?: string | undefined; url?: AppRoute | "" | undefined }
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
 */
export function transformCtaFields<
  T extends {
    ctaPrimary?: { text: string; url: AppRoute } | undefined;
    ctaSecondary?:
      | { text?: string | undefined; url?: AppRoute | "" | undefined }
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
