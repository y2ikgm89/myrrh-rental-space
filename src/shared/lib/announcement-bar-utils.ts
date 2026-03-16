/**
 * お知らせバー共通ユーティリティ
 *
 * カルーセルコンポーネントと管理画面で共有する関数・定数
 */

import type { CSSProperties } from "react";
import {
  AnnouncementBarAnimation,
  AnnouncementBarDesignStyle,
} from "@/shared/db/enums";
import {
  isValidAnnouncementBarAnimation,
  isValidAnnouncementBarDesignStyle,
} from "@/shared/lib/validations/enums";

// =============================================================================
// Types
// =============================================================================

export interface TypeColorConfig {
  bg: string;
  text: string;
  hover: string;
  gradient: string;
  hex: string;
}

// =============================================================================
// Constants
// =============================================================================

/**
 * タイプ別のデフォルトカラー設定
 */
export const DEFAULT_TYPE_STYLE: TypeColorConfig = {
  bg: "bg-info",
  text: "text-info-foreground",
  hover: "hover:text-info-foreground/80",
  gradient: "from-info to-info/80",
  hex: "#2563eb",
};

export const TYPE_STYLES: Record<string, TypeColorConfig> = {
  info: DEFAULT_TYPE_STYLE,
  warning: {
    bg: "bg-warning",
    text: "text-warning-foreground",
    hover: "hover:text-warning-foreground/80",
    gradient: "from-warning to-warning/80",
    hex: "#f59e0b",
  },
  promo: {
    bg: "bg-success",
    text: "text-success-foreground",
    hover: "hover:text-success-foreground/80",
    gradient: "from-success to-success/80",
    hex: "#15803d",
  },
};

/**
 * デザインスタイル別クラス設定
 */
export const DESIGN_STYLE_CLASSES: Record<
  AnnouncementBarDesignStyle,
  {
    container: string;
    containerWithBg: (type: string) => string;
    border?: string;
  }
> = {
  solid: {
    container: "",
    containerWithBg: (type) => TYPE_STYLES[type]?.bg ?? DEFAULT_TYPE_STYLE.bg,
  },
  gradient: {
    container: "bg-gradient-to-r",
    containerWithBg: (type) =>
      TYPE_STYLES[type]?.gradient ?? DEFAULT_TYPE_STYLE.gradient,
  },
  outlined: {
    container: "bg-transparent border-y",
    containerWithBg: () => "",
    border: "border-current",
  },
  glass: {
    container: "backdrop-blur-md bg-card/10 border-y border-card/20",
    containerWithBg: () => "",
  },
  minimal: {
    container: "bg-transparent border-b",
    containerWithBg: () => "",
    border: "border-current/30",
  },
  striped: {
    container: "",
    containerWithBg: (type) => TYPE_STYLES[type]?.bg ?? DEFAULT_TYPE_STYLE.bg,
  },
};

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * HEX色の明度を調整する（内部使用）
 *
 * @param hex - HEX形式の色 (例: "#2563eb")
 * @param percent - 調整量 (正: 明るく、負: 暗く)
 * @returns 調整後のHEX色
 */
function adjustColorBrightness(hex: string, percent: number): string {
  const color = hex.replace("#", "");
  const num = parseInt(color, 16);
  const r = Math.min(255, Math.max(0, (num >> 16) + percent));
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent));
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent));
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, "0")}`;
}

/**
 * ストライプ背景のスタイルを生成する
 *
 * @param baseColor - ベースのHEX色
 * @param stripeColor - ストライプ色 (null の場合は baseColor を明るくした色を使用)
 * @param animate - アニメーションを有効にするか
 * @returns React.CSSProperties
 */
export function getStripedStyle(
  baseColor: string,
  stripeColor: string | null,
  animate: boolean,
): CSSProperties {
  const stripe = stripeColor || adjustColorBrightness(baseColor, 20);
  return {
    backgroundImage: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 10px,
      ${stripe}20 10px,
      ${stripe}20 20px
    )`,
    backgroundSize: animate ? "28.28px 28.28px" : undefined,
    animation: animate ? "stripe-slide 1s linear infinite" : undefined,
  };
}

/**
 * タイプからHEX色を取得する
 *
 * @param type - タイプ名 (info, warning, promo)
 * @returns HEX色
 */
export function getTypeHexColor(type: string): string {
  return TYPE_STYLES[type]?.hex ?? DEFAULT_TYPE_STYLE.hex;
}

/**
 * グラデーションアニメーション用のスタイルを生成する
 *
 * @param animate - アニメーションを有効にするか
 * @returns CSSProperties
 */
export function getGradientAnimationStyle(animate: boolean): CSSProperties {
  if (!animate) return {};
  return {
    backgroundSize: "200% 100%",
    animation: "gradient-flow 3s ease infinite",
  };
}

/**
 * グラス（シマー）アニメーション用のスタイルを生成する
 *
 * @param animate - アニメーションを有効にするか
 * @returns CSSProperties
 */
export function getGlassShimmerStyle(animate: boolean): CSSProperties {
  if (!animate) return {};
  return {
    position: "relative",
    overflow: "hidden",
  };
}

// =============================================================================
// Validation Helpers
// =============================================================================

/**
 * アニメーションタイプをバリデートする
 */
export function validateAnimation(value: string): AnnouncementBarAnimation {
  return isValidAnnouncementBarAnimation(value)
    ? value
    : AnnouncementBarAnimation.fade;
}

/**
 * デザインスタイルをバリデートする
 */
export function validateDesignStyle(value: string): AnnouncementBarDesignStyle {
  return isValidAnnouncementBarDesignStyle(value)
    ? value
    : AnnouncementBarDesignStyle.solid;
}
