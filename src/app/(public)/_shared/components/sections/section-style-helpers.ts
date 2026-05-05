/**
 * Section style helpers — pure functions for title / text styling derived from
 * `SectionStylePayload`. Server Components から import 可能な pure module。
 *
 * `SectionWrapper.tsx` から分離（"use client" モジュールの非-Component export を
 * Server Component から呼ぶと Client Reference として扱われ、Server で実行できない）。
 */

import type { CSSProperties } from "react";
import type { SectionStylePayload } from "@/shared/domain/section-styles/types";

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
 * style から title 用 inline style を生成（カラー指定時のみ）
 */
export function getTitleStyle(
  style: SectionStylePayload,
): CSSProperties | undefined {
  return style.typography.titleColor
    ? { color: style.typography.titleColor }
    : undefined;
}

/**
 * style から body text 用 inline style を生成（カラー指定時のみ）
 */
export function getTextStyle(
  style: SectionStylePayload,
): CSSProperties | undefined {
  return style.typography.textColor
    ? { color: style.typography.textColor }
    : undefined;
}
