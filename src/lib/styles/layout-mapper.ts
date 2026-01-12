/**
 * レイアウト幅のスタイルマッピング
 *
 * LayoutWidth Enumから適切なTailwindクラスまたはCSS変数を生成
 */

import { cn } from '@/lib/utils'
import { LayoutWidth } from '@/types/prisma'
import type { LayoutConfig } from '@/lib/layout-settings'
import type { CSSProperties } from 'react'

// =============================================================================
// Width Mapping Tables
// =============================================================================

/**
 * Container幅のTailwindクラスマッピング
 */
const CONTAINER_WIDTH_MAP: Record<LayoutWidth, string> = {
  [LayoutWidth.XS]: 'max-w-xl',          // 640px
  [LayoutWidth.SM]: 'max-w-3xl',         // 768px
  [LayoutWidth.MD]: 'max-w-5xl',         // 1024px
  [LayoutWidth.LG]: 'max-w-7xl',         // 1280px
  [LayoutWidth.XL]: 'max-w-screen-2xl',  // 1536px
  [LayoutWidth.FULL]: 'max-w-full',      // 100%
  [LayoutWidth.CUSTOM]: '',              // カスタム値はstyleで対応
}

/**
 * コンテンツ幅のTailwindクラスマッピング
 */
const CONTENT_WIDTH_MAP: Record<LayoutWidth, string> = {
  [LayoutWidth.XS]: 'max-w-xl',          // 640px
  [LayoutWidth.SM]: 'max-w-3xl',         // 768px
  [LayoutWidth.MD]: 'max-w-5xl',         // 1024px
  [LayoutWidth.LG]: 'max-w-7xl',         // 1280px
  [LayoutWidth.XL]: 'max-w-screen-2xl',  // 1536px
  [LayoutWidth.FULL]: 'max-w-full',      // 100%
  [LayoutWidth.CUSTOM]: '',              // カスタム値はstyleで対応
}

/**
 * 幅プリセットのピクセル値（UI表示用）
 */
export const WIDTH_PRESETS = {
  [LayoutWidth.XS]: { label: '極小', px: 640 },
  [LayoutWidth.SM]: { label: '小', px: 768 },
  [LayoutWidth.MD]: { label: '中', px: 1024 },
  [LayoutWidth.LG]: { label: '大', px: 1280 },
  [LayoutWidth.XL]: { label: '特大', px: 1536 },
  [LayoutWidth.FULL]: { label: '全幅', px: null },
  [LayoutWidth.CUSTOM]: { label: 'カスタム', px: null },
} as const

// =============================================================================
// Container Style Functions
// =============================================================================

/**
 * Containerのクラス名を取得
 */
export function getContainerClass(config: LayoutConfig): string {
  const { containerWidth, containerWidthCustom } = config

  // カスタム幅の場合はmax-wクラスを除外（styleで対応）
  if (containerWidth === LayoutWidth.CUSTOM && containerWidthCustom) {
    return 'mx-auto w-full px-4 sm:px-6 lg:px-8'
  }

  return cn(
    'mx-auto w-full px-4 sm:px-6 lg:px-8',
    CONTAINER_WIDTH_MAP[containerWidth]
  )
}

/**
 * Containerのstyleオブジェクトを取得（カスタム幅用）
 */
export function getContainerStyle(config: LayoutConfig): CSSProperties | undefined {
  const { containerWidth, containerWidthCustom } = config

  if (containerWidth === LayoutWidth.CUSTOM && containerWidthCustom) {
    return {
      maxWidth: `${containerWidthCustom}px`,
    }
  }

  return undefined
}

// =============================================================================
// Content Style Functions
// =============================================================================

/**
 * コンテンツのクラス名を取得
 */
export function getContentClass(config: LayoutConfig): string {
  const { contentWidth, contentWidthCustom } = config

  // カスタム幅の場合はmax-wクラスを除外
  if (contentWidth === LayoutWidth.CUSTOM && contentWidthCustom) {
    return 'mx-auto'
  }

  return cn('mx-auto', CONTENT_WIDTH_MAP[contentWidth])
}

/**
 * コンテンツのstyleオブジェクトを取得（カスタム幅用）
 */
export function getContentStyle(config: LayoutConfig): CSSProperties | undefined {
  const { contentWidth, contentWidthCustom } = config

  if (contentWidth === LayoutWidth.CUSTOM && contentWidthCustom) {
    return {
      maxWidth: `${contentWidthCustom}px`,
    }
  }

  return undefined
}

// =============================================================================
// Combined Style Functions
// =============================================================================

/**
 * Container用のクラスとスタイルを一括取得
 */
export function getContainerStyles(config: LayoutConfig): {
  className: string
  style: CSSProperties | undefined
} {
  return {
    className: getContainerClass(config),
    style: getContainerStyle(config),
  }
}

/**
 * Content用のクラスとスタイルを一括取得
 */
export function getContentStyles(config: LayoutConfig): {
  className: string
  style: CSSProperties | undefined
} {
  return {
    className: getContentClass(config),
    style: getContentStyle(config),
  }
}

// =============================================================================
// Utility Functions
// =============================================================================

/**
 * 幅の説明文を取得（UI表示用）
 */
export function getWidthLabel(width: LayoutWidth, customPx?: number | null): string {
  if (width === LayoutWidth.CUSTOM && customPx) {
    return `カスタム (${customPx}px)`
  }

  const preset = WIDTH_PRESETS[width]
  if (preset.px) {
    return `${preset.label} (${preset.px}px)`
  }
  return preset.label
}

type WidthOption = {
  value: LayoutWidth
  label: string
  description: string
}

/**
 * プリセット選択オプションを取得（管理画面用）
 */
export function getWidthOptions(includeCustom = true): WidthOption[] {
  const options: WidthOption[] = [
    { value: LayoutWidth.XS, label: '極小 (640px)', description: '狭いコンテンツ向け' },
    { value: LayoutWidth.SM, label: '小 (768px)', description: '記事コンテンツ推奨' },
    { value: LayoutWidth.MD, label: '中 (1024px)', description: 'バランスの良い幅' },
    { value: LayoutWidth.LG, label: '大 (1280px)', description: 'Container推奨' },
    { value: LayoutWidth.XL, label: '特大 (1536px)', description: 'ワイドスクリーン向け' },
    { value: LayoutWidth.FULL, label: '全幅', description: '画面幅いっぱい' },
  ]

  if (includeCustom) {
    options.push({
      value: LayoutWidth.CUSTOM,
      label: 'カスタム',
      description: '任意の幅を指定',
    })
  }

  return options
}
