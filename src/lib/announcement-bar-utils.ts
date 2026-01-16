/**
 * お知らせバー共通ユーティリティ
 *
 * カルーセルコンポーネントと管理画面で共有する関数・定数
 */

import type { CSSProperties } from 'react'

// =============================================================================
// Types
// =============================================================================

export type DesignStyle = 'solid' | 'gradient' | 'outlined' | 'glass' | 'minimal' | 'striped'
export type AnimationType = 'fade' | 'slideX' | 'slideY'

export interface TypeColorConfig {
  bg: string
  text: string
  hover: string
  gradient: string
  hex: string
}

// =============================================================================
// Constants
// =============================================================================

/**
 * タイプ別のデフォルトカラー設定
 */
export const TYPE_STYLES: Record<string, TypeColorConfig> = {
  info: {
    bg: 'bg-blue-600',
    text: 'text-white',
    hover: 'hover:text-blue-100',
    gradient: 'from-blue-600 to-indigo-600',
    hex: '#2563eb',
  },
  warning: {
    bg: 'bg-amber-500',
    text: 'text-black',
    hover: 'hover:text-amber-900',
    gradient: 'from-amber-500 to-orange-500',
    hex: '#f59e0b',
  },
  promo: {
    bg: 'bg-green-600',
    text: 'text-white',
    hover: 'hover:text-green-100',
    gradient: 'from-green-600 to-emerald-500',
    hex: '#16a34a',
  },
}

/**
 * デザインスタイル別クラス設定
 */
export const DESIGN_STYLE_CLASSES: Record<DesignStyle, {
  container: string
  containerWithBg: (type: string) => string
  border?: string
}> = {
  solid: {
    container: '',
    containerWithBg: (type) => TYPE_STYLES[type]?.bg || TYPE_STYLES.info.bg,
  },
  gradient: {
    container: 'bg-gradient-to-r',
    containerWithBg: (type) => TYPE_STYLES[type]?.gradient || TYPE_STYLES.info.gradient,
  },
  outlined: {
    container: 'bg-transparent border-y',
    containerWithBg: () => '',
    border: 'border-current',
  },
  glass: {
    container: 'backdrop-blur-md bg-white/10 border-y border-white/20',
    containerWithBg: () => '',
  },
  minimal: {
    container: 'bg-transparent border-b',
    containerWithBg: () => '',
    border: 'border-current/30',
  },
  striped: {
    container: '',
    containerWithBg: (type) => TYPE_STYLES[type]?.bg || TYPE_STYLES.info.bg,
  },
}

/**
 * アニメーションバリアント (Framer Motion用)
 */
export const ANIMATION_VARIANTS = {
  fade: {
    initial: { opacity: 0 },
    animate: { opacity: 1 },
    exit: { opacity: 0 },
  },
  slideX: {
    initial: { opacity: 0, x: 50 },
    animate: { opacity: 1, x: 0 },
    exit: { opacity: 0, x: -50 },
  },
  slideY: {
    initial: { opacity: 0, y: -20 },
    animate: { opacity: 1, y: 0 },
    exit: { opacity: 0, y: 20 },
  },
}

// =============================================================================
// Helper Functions
// =============================================================================

/**
 * HEX色の明度を調整する
 *
 * @param hex - HEX形式の色 (例: "#2563eb")
 * @param percent - 調整量 (正: 明るく、負: 暗く)
 * @returns 調整後のHEX色
 */
export function adjustColorBrightness(hex: string, percent: number): string {
  const color = hex.replace('#', '')
  const num = parseInt(color, 16)
  const r = Math.min(255, Math.max(0, (num >> 16) + percent))
  const g = Math.min(255, Math.max(0, ((num >> 8) & 0x00ff) + percent))
  const b = Math.min(255, Math.max(0, (num & 0x0000ff) + percent))
  return `#${((r << 16) | (g << 8) | b).toString(16).padStart(6, '0')}`
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
  animate: boolean
): CSSProperties {
  const stripe = stripeColor || adjustColorBrightness(baseColor, 20)
  return {
    backgroundImage: `repeating-linear-gradient(
      -45deg,
      transparent,
      transparent 10px,
      ${stripe}20 10px,
      ${stripe}20 20px
    )`,
    backgroundSize: animate ? '28.28px 28.28px' : undefined,
    animation: animate ? 'stripe-slide 1s linear infinite' : undefined,
  }
}

/**
 * タイプからHEX色を取得する
 *
 * @param type - タイプ名 (info, warning, promo)
 * @returns HEX色
 */
export function getTypeHexColor(type: string): string {
  return TYPE_STYLES[type]?.hex || TYPE_STYLES.info.hex
}

/**
 * グラデーションアニメーション用のスタイルを生成する
 *
 * @param animate - アニメーションを有効にするか
 * @returns CSSProperties
 */
export function getGradientAnimationStyle(animate: boolean): CSSProperties {
  if (!animate) return {}
  return {
    backgroundSize: '200% 100%',
    animation: 'gradient-flow 3s ease infinite',
  }
}

/**
 * グラス（シマー）アニメーション用のスタイルを生成する
 *
 * @param animate - アニメーションを有効にするか
 * @returns CSSProperties
 */
export function getGlassShimmerStyle(animate: boolean): CSSProperties {
  if (!animate) return {}
  return {
    position: 'relative',
    overflow: 'hidden',
  }
}

// =============================================================================
// Validation Helpers
// =============================================================================

const VALID_ANIMATIONS: AnimationType[] = ['fade', 'slideX', 'slideY']
const VALID_DESIGN_STYLES: DesignStyle[] = ['solid', 'gradient', 'outlined', 'glass', 'minimal', 'striped']

/**
 * アニメーションタイプをバリデートする
 */
export function validateAnimation(value: string): AnimationType {
  return VALID_ANIMATIONS.includes(value as AnimationType)
    ? (value as AnimationType)
    : 'fade'
}

/**
 * デザインスタイルをバリデートする
 */
export function validateDesignStyle(value: string): DesignStyle {
  return VALID_DESIGN_STYLES.includes(value as DesignStyle)
    ? (value as DesignStyle)
    : 'solid'
}
