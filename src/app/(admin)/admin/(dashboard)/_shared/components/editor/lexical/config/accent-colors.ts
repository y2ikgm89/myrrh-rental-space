/**
 * Accent Color System
 *
 * @description 全ブロック共通のアクセントカラー定義
 * CSS: [data-color="X"] { --accent: ...; --accent-fg: ...; }
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
// Swatch CSS values（ColorSwatchPicker で表示する実際の色値）
// =============================================================================

export const ACCENT_COLOR_SWATCHES: Record<AccentColor, string> = {
  default: 'var(--color-primary)',
  blue:    'oklch(0.55 0.20 255)',
  teal:    'oklch(0.60 0.15 195)',
  green:   'oklch(0.58 0.18 142)',
  yellow:  'oklch(0.82 0.17 90)',
  orange:  'oklch(0.72 0.18 55)',
  red:     'oklch(0.55 0.22 25)',
  pink:    'oklch(0.65 0.22 350)',
  purple:  'oklch(0.55 0.20 300)',
  slate:   'oklch(0.52 0.02 250)',
}
