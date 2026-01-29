/**
 * セクション共通スタイル
 *
 * ページセクションで使用する共通のスタイル定義
 * デザイン変更時はこのファイルを修正することで一括変更可能
 */

import { tv } from 'tailwind-variants'

// =============================================================================
// セクション基本スタイル
// =============================================================================

/**
 * セクションコンテナの共通スタイル
 */
export const sectionVariants = tv({
  base: 'py-12 md:py-16',
  variants: {
    background: {
      default: 'bg-background',
      muted: 'bg-muted/30',
      accent: 'bg-accent/10',
      primary: 'bg-primary/5',
    },
    padding: {
      none: 'py-0',
      sm: 'py-8 md:py-12',
      md: 'py-12 md:py-16',
      lg: 'py-16 md:py-24',
    },
  },
  defaultVariants: {
    background: 'default',
    padding: 'md',
  },
})

/**
 * セクションタイトルの共通スタイル
 */
export const sectionTitleVariants = tv({
  base: 'text-2xl font-bold md:text-3xl mb-8 text-center text-foreground',
  variants: {
    align: {
      left: 'text-left',
      center: 'text-center',
      right: 'text-right',
    },
    size: {
      sm: 'text-xl md:text-2xl mb-6',
      md: 'text-2xl md:text-3xl mb-8',
      lg: 'text-3xl md:text-4xl mb-10',
    },
  },
  defaultVariants: {
    align: 'center',
    size: 'md',
  },
})

// =============================================================================
// グリッドスタイル
// =============================================================================

/**
 * グリッドカラム数
 */
export const gridColumnClasses = {
  1: 'grid-cols-1',
  2: 'grid-cols-1 sm:grid-cols-2',
  3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
  4: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
  5: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-5',
  6: 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-6',
} as const

/**
 * グリッド間隔
 */
export const gridGapClasses = {
  none: 'gap-0',
  sm: 'gap-2',
  md: 'gap-4',
  lg: 'gap-6',
  xl: 'gap-8',
} as const

/**
 * Masonryレイアウト用カラムクラス
 *
 * 注意: Tailwind CSSは動的クラス（`lg:columns-${n}`）を検出できないため、
 * 完全なクラス名を事前定義する必要がある
 */
export const masonryColumnClasses = {
  1: 'columns-1',
  2: 'columns-1 sm:columns-2',
  3: 'columns-1 sm:columns-2 lg:columns-3',
  4: 'columns-1 sm:columns-2 lg:columns-4',
  5: 'columns-1 sm:columns-2 lg:columns-5',
  6: 'columns-1 sm:columns-2 lg:columns-6',
} as const

// =============================================================================
// カードスタイル
// =============================================================================

/**
 * カードの共通スタイル
 */
export const cardVariants = tv({
  base: 'bg-card rounded-lg shadow-sm border border-border',
  variants: {
    padding: {
      none: '',
      sm: 'p-4',
      md: 'p-6',
      lg: 'p-8',
    },
    hover: {
      none: '',
      lift: 'transition-transform hover:-translate-y-1',
      glow: 'transition-shadow hover:shadow-md',
    },
  },
  defaultVariants: {
    padding: 'md',
    hover: 'none',
  },
})

// =============================================================================
// オーバーレイスタイル
// =============================================================================

/**
 * 画像オーバーレイの共通スタイル
 *
 * 注意: テーマに依存しない固定色を使用
 * 画像の上に重ねるため、背景色に関係なく視認性を確保
 */
export const imageOverlayClasses = {
  /** 画像キャプション用グラデーション（下から上） */
  captionGradient: 'bg-gradient-to-t from-black/60 to-transparent',
  /** 全体オーバーレイ（薄め） */
  light: 'bg-black/30',
  /** 全体オーバーレイ（標準） */
  medium: 'bg-black/40',
  /** 全体オーバーレイ（濃いめ） */
  dark: 'bg-black/60',
} as const

/**
 * オーバーレイ上のテキストスタイル
 *
 * 注意: オーバーレイの上に表示するため白固定
 */
export const overlayTextClasses = {
  primary: 'text-white',
  secondary: 'text-white/90',
  muted: 'text-white/70',
} as const

// =============================================================================
// 評価・レーティングスタイル
// =============================================================================

/**
 * 星評価の色
 *
 * 注意: 評価を表す一般的な色として黄色を使用（テーマ非依存）
 * デザイン変更時はここを修正することで一括変更可能
 */
export const ratingStarClasses = {
  /** 塗りつぶされた星 */
  filled: 'fill-yellow-400 text-yellow-400',
  /** 空の星 */
  empty: 'fill-muted text-muted',
} as const

// =============================================================================
// ヘルパー関数
// =============================================================================

type GridColumnKey = keyof typeof gridColumnClasses
type GridGapKey = keyof typeof gridGapClasses
type MasonryColumnKey = keyof typeof masonryColumnClasses

function isValidGridColumn(columns: number): columns is GridColumnKey {
  return columns in gridColumnClasses
}

function isValidGridGap(gap: string): gap is GridGapKey {
  return gap in gridGapClasses
}

function isValidMasonryColumn(columns: number): columns is MasonryColumnKey {
  return columns in masonryColumnClasses
}

/**
 * グリッドカラムクラスを取得
 */
export function getGridColumnClass(columns: number): string {
  return isValidGridColumn(columns) ? gridColumnClasses[columns] : gridColumnClasses[3]
}

/**
 * グリッドギャップクラスを取得
 */
export function getGridGapClass(gap: string): string {
  return isValidGridGap(gap) ? gridGapClasses[gap] : gridGapClasses.md
}

/**
 * Masonryカラムクラスを取得
 */
export function getMasonryColumnClass(columns: number): string {
  return isValidMasonryColumn(columns) ? masonryColumnClasses[columns] : masonryColumnClasses[3]
}
