/**
 * Accent Color System
 *
 * @description 全ブロック共通のアクセントカラー定義
 * CSS: [data-color="X"] { --accent: ...; --accent-fg: ...; }
 *
 * IMPORTANT: ACCENT_COLOR_SWATCHES の OKLCH 値は lexical-content.css の
 * [data-color] トークン定義と完全に一致させること（単一ソース of truth）。
 */

import { createEnumGuard } from './type-guards'

// =============================================================================
// Types
// =============================================================================

export type AccentColor =
  | 'default'
  | 'blue'
  | 'teal'
  | 'green'
  | 'yellow'
  | 'orange'
  | 'red'
  | 'pink'
  | 'purple'
  | 'slate'

export const ACCENT_COLORS: readonly AccentColor[] = [
  'default',
  'blue',
  'teal',
  'green',
  'yellow',
  'orange',
  'red',
  'pink',
  'purple',
  'slate',
] as const

// =============================================================================
// Type Guard
// =============================================================================

export const isAccentColor = createEnumGuard<AccentColor>(ACCENT_COLORS)

// =============================================================================
// Labels（ColorSwatchPicker の aria-label / title に使用）
// =============================================================================

export const ACCENT_COLOR_LABELS: Record<AccentColor, string> = {
  default: 'デフォルト',
  blue:    'ブルー',
  teal:    'ティール',
  green:   'グリーン',
  yellow:  'イエロー',
  orange:  'オレンジ',
  red:     'レッド',
  pink:    'ピンク',
  purple:  'パープル',
  slate:   'スレート',
}

// =============================================================================
// Swatch CSS values（ColorSwatchPicker のスウォッチ表示色）
//
// lexical-content.css の [data-color] --accent 値と完全に一致させること。
// default は CSS 変数参照（テーマのプライマリ色をそのまま使用）。
// =============================================================================

export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  default: 'var(--color-primary)',
  blue:    'oklch(0.55 0.20 260)',
  teal:    'oklch(0.55 0.15 185)',
  green:   'oklch(0.55 0.18 145)',
  yellow:  'oklch(0.75 0.18 85)',
  orange:  'oklch(0.65 0.20 50)',
  red:     'oklch(0.55 0.22 25)',
  pink:    'oklch(0.60 0.20 350)',
  purple:  'oklch(0.55 0.20 300)',
  slate:   'oklch(0.45 0.04 250)',
}
