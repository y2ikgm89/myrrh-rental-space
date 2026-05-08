/**
 * URL / CTA ボタン / HEXカラー バリデーションヘルパー
 *
 * section-design.ts から切り出した共通ユーティリティ。
 * typed section config validation から利用される。
 *
 * Phase 2A (2026-05-02): legacy ctaPrimary/ctaSecondary 関連 helper
 * (`createCtaSchemas` / `transformLegacyCtaToButtons` / `transformCtaFields`)
 * を完全削除。buttons[] (`createButtonsArraySchema`) が SSoT。
 */

import { z } from "zod";
import {
  isAppRoute,
  toAppRoute,
  type AppRoute,
} from "@/shared/lib/typed-routes";
import {
  createSpanArraySchema,
  type PortableTextSpan,
} from "@/shared/lib/portable-text";

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
// CTAボタン配列スキーマ（buttons[] SSoT）
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
 * CTAボタン配列アイテムスキーマファクトリ。
 *
 * Phase 2A 以降、フィールド shape は `definitions/_shared/buttons.ts` の
 * `createButtonsArraySchema` と一致させる必要がある。section.ts (`heroConfigSchema` /
 * `ctaConfigSchema` の旧 schema 経由) と新 definitions レジストリの両方が同じ
 * runtime shape を使う。
 */
export function createCtaButtonItemSchema<TUrl extends string>(
  urlSchema: z.ZodType<TUrl>,
) {
  return z.object({
    label: createSpanArraySchema(),
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
  label: PortableTextSpan[];
  url: AppRoute;
  variant: CTAButtonVariant;
  size: CTAButtonSize;
  openInNewTab: boolean;
  backgroundColor?: string | undefined;
  textColor?: string | undefined;
};
