/**
 * Section style helpers — pure functions for title / text styling derived from
 * `SectionStylePayload`. Server Components から import 可能な pure module。
 *
 * CSP strict: React `style=` 禁止。CSS var 値は build*CssVars / build*StyleRule
 * で生成し、NonceStyleBlock または ImperativeCssScope へ渡す。
 */

import type { SectionStylePayload } from "@/shared/domain/section-styles/types";
import { CSS_VAR, CSS_VAR_CLASS } from "@/shared/lib/csp/css-vars";
import { buildDataStyleRule } from "@/shared/lib/csp/sanitize-css";

/**
 * titleSize → レスポンシブ CSS クラスのマッピング
 *
 * - 値は SectionStylePayload.typography.titleSize と 1:1 対応
 * - `satisfies` で網羅チェック: titleSize に値追加時にコンパイルエラー
 */
export const titleSizeMap = {
  sm: "text-xl md:text-2xl",
  md: "text-2xl md:text-3xl",
  lg: "text-2xl md:text-3xl lg:text-4xl",
  xl: "text-3xl md:text-4xl lg:text-5xl",
} satisfies Record<
  NonNullable<SectionStylePayload["typography"]["titleSize"]>,
  string
>;

/**
 * style から title 用 CSS クラスを生成
 */
export function getTitleClasses(style: SectionStylePayload): string {
  return titleSizeMap[style.typography.titleSize] ?? titleSizeMap.lg;
}

/**
 * style から title 用 CSS var レコードを生成（カラー指定時のみ）
 */
export function buildTitleCssVars(
  style: SectionStylePayload,
): Record<string, string> | undefined {
  return style.typography.titleColor
    ? { [CSS_VAR.sectionTitleColor]: style.typography.titleColor }
    : undefined;
}

/**
 * style から title 用 Tailwind class を生成（カラー指定時のみ）
 */
export function getTitleColorClass(style: SectionStylePayload): string {
  return style.typography.titleColor ? CSS_VAR_CLASS.sectionTitleColor : "";
}

/**
 * style から body text 用 CSS var レコードを生成（カラー指定時のみ）
 */
export function buildTextCssVars(
  style: SectionStylePayload,
): Record<string, string> | undefined {
  return style.typography.textColor
    ? { [CSS_VAR.sectionTextColor]: style.typography.textColor }
    : undefined;
}

/**
 * style から body text 用 Tailwind class を生成（カラー指定時のみ）
 */
export function getTextColorClass(style: SectionStylePayload): string {
  return style.typography.textColor ? CSS_VAR_CLASS.sectionTextColor : "";
}

/**
 * セクション背景色用 CSS var レコード（CTA 等の config.backgroundColor 向け）
 */
export function buildSectionBgCssVars(
  backgroundColor: string | undefined,
): Record<string, string> | undefined {
  return backgroundColor
    ? { [CSS_VAR.sectionBgColor]: backgroundColor }
    : undefined;
}

export function buildSectionStyleRule(
  styleId: string,
  vars: Record<string, string | number | undefined | null> | undefined,
): string {
  if (!vars) return "";
  return buildDataStyleRule(styleId, vars);
}
