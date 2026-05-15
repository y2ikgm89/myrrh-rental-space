/**
 * レイアウト幅のスタイルマッピング
 *
 * ContentWidth → CSS className + style を解決する Single Source of Truth
 */

import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import type { CSSProperties } from "react";
import type { ContentWidth } from "@/shared/types/layout";

// =============================================================================
// Types
// =============================================================================

export interface WidthPreset {
  label: string;
  description: string;
  px: number | null;
}

export interface WidthStyles {
  className: string;
  style: CSSProperties | undefined;
  /** 解決済みピクセル値（FULL の場合は null） */
  px: number | null;
}

// =============================================================================
// Presets (Single Source of Truth)
// =============================================================================

export const SITE_WIDTH_PRESETS: Record<LayoutWidth, WidthPreset> = {
  [LayoutWidth.XS]: { label: "極小", description: "未使用", px: 900 },
  [LayoutWidth.SM]: { label: "小", description: "コンパクト", px: 1000 },
  [LayoutWidth.MD]: { label: "中", description: "スタンダード", px: 1100 },
  [LayoutWidth.LG]: { label: "大", description: "ワイド", px: 1200 },
  [LayoutWidth.XL]: {
    label: "特大",
    description: "エクストラワイド",
    px: 1400,
  },
  [LayoutWidth.FULL]: {
    label: "全幅",
    description: "画面幅いっぱい",
    px: null,
  },
  [LayoutWidth.CUSTOM]: {
    label: "カスタム",
    description: "任意の幅を指定",
    px: null,
  },
};

export const CONTENT_WIDTH_PRESETS: Record<LayoutWidth, WidthPreset> = {
  [LayoutWidth.XS]: { label: "極小", description: "長文テキスト向け", px: 640 },
  [LayoutWidth.SM]: { label: "小", description: "コンパクト", px: 720 },
  [LayoutWidth.MD]: { label: "中", description: "スタンダード", px: 800 },
  [LayoutWidth.LG]: { label: "大", description: "ワイド", px: 900 },
  [LayoutWidth.XL]: {
    label: "特大",
    description: "画像・ギャラリー向け",
    px: 1024,
  },
  [LayoutWidth.FULL]: {
    label: "全幅",
    description: "画面幅いっぱい",
    px: null,
  },
  [LayoutWidth.CUSTOM]: {
    label: "カスタム",
    description: "任意の幅を指定",
    px: null,
  },
};

// =============================================================================
// Style Resolution
// =============================================================================

/**
 * ContentWidth → CSS className + style を解決
 *
 * 旧 getContentStyles(LayoutConfig) の後継。最小入力のみ受け取る。
 */
export function resolveWidthStyles(
  cw: ContentWidth,
  presets: Record<LayoutWidth, WidthPreset> = CONTENT_WIDTH_PRESETS,
): WidthStyles {
  const { width, customPx } = cw;

  if (width === LayoutWidth.FULL) {
    return { className: "mx-auto max-w-full", style: undefined, px: null };
  }

  if (width === LayoutWidth.CUSTOM && customPx) {
    return {
      className: "mx-auto",
      style: { maxWidth: `${customPx}px` },
      px: customPx,
    };
  }

  const preset = presets[width];
  if (preset.px) {
    return {
      className: "mx-auto",
      style: { maxWidth: `${preset.px}px` },
      px: preset.px,
    };
  }

  return { className: "mx-auto", style: undefined, px: null };
}
