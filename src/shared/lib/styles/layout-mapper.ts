/**
 * レイアウト幅のスタイルマッピング
 *
 * ContentWidth → CSS className + style を解決する Single Source of Truth
 */

import { LayoutWidth } from "@/shared/lib/validations/enums/prisma-types";
import type { CSSProperties } from "react";
import type { ContentWidth, LayoutConfig } from "@/shared/types/layout";

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
  [LayoutWidth.XS]: { label: "極小", description: "コンテンツ専用", px: 900 },
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

/**
 * LayoutConfig.containerWidth/containerWidthCustom → `--container-site` の CSS
 * length 文字列を解決する。公開ルートの <main> に inline 注入し、Container
 * (default variant) / SectionWrapper / 各リスト・詳細セクションが参照する
 * var(--container-site) を上書きする。FULL / CUSTOM(px なし) は "100%"。
 * contentWidth の resolveWidthStyles と同列の純粋関数（DB 非依存）。
 *
 * 命名: `--container-max` ではなく `--container-site` に固定。Tailwind v4 の
 * `@theme --container-*` は max-w-{name} / w-{name} を自動生成し、`max` は
 * built-in `w-max` / `max-w-max` (= max-content) と silently 衝突する仕様
 * （memory: project_tailwind-v4-theme-token-collision-2026-06-18）。
 */
export function getContainerSiteCss(config: LayoutConfig): string {
  const { containerWidth, containerWidthCustom } = config;
  if (containerWidth === LayoutWidth.FULL) return "100%";
  if (containerWidth === LayoutWidth.CUSTOM) {
    return containerWidthCustom && containerWidthCustom > 0
      ? `${containerWidthCustom}px`
      : "100%";
  }
  const px = SITE_WIDTH_PRESETS[containerWidth].px;
  return px ? `${px}px` : "100%";
}
