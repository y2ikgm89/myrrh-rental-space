/**
 * レイアウト幅のスタイルマッピング
 *
 * LayoutWidth Enumから適切なCSSスタイルを生成
 */

import { cn } from '@/shared/lib/utils'
import { LayoutWidth } from '@/shared/types/prisma'
import type { LayoutConfig } from '@/shared/types/layout'
import type { CSSProperties } from 'react'

// =============================================================================
// Width Mapping Tables
// =============================================================================

/**
 * サイト幅のピクセル値マッピング
 */
const SITE_WIDTH_PX_MAP: Record<LayoutWidth, number | null> = {
  [LayoutWidth.XS]: 900,    // 極小（未使用）
  [LayoutWidth.SM]: 1000,   // コンパクト
  [LayoutWidth.MD]: 1100,   // スタンダード
  [LayoutWidth.LG]: 1200,   // ワイド（デフォルト）
  [LayoutWidth.XL]: 1400,   // エクストラワイド
  [LayoutWidth.FULL]: null, // 100%
  [LayoutWidth.CUSTOM]: null, // カスタム値はstyleで対応
}

/**
 * コンテンツ幅のピクセル値マッピング
 */
const CONTENT_WIDTH_PX_MAP: Record<LayoutWidth, number | null> = {
  [LayoutWidth.XS]: 640,   // 長文テキスト向け
  [LayoutWidth.SM]: 720,   // コンパクト
  [LayoutWidth.MD]: 800,   // スタンダード（デフォルト）
  [LayoutWidth.LG]: 900,   // ワイド
  [LayoutWidth.XL]: 1024,  // 画像・ギャラリー向け
  [LayoutWidth.FULL]: null, // 100%
  [LayoutWidth.CUSTOM]: null, // カスタム値はstyleで対応
}

// =============================================================================
// Width Presets (UI表示用)
// =============================================================================

interface WidthPreset {
  label: string
  px: number | null
}

/**
 * サイト幅プリセット
 */
export const SITE_WIDTH_PRESETS: Record<LayoutWidth, WidthPreset> = {
  [LayoutWidth.XS]: { label: '極小', px: 900 },
  [LayoutWidth.SM]: { label: '小', px: 1000 },
  [LayoutWidth.MD]: { label: '中', px: 1100 },
  [LayoutWidth.LG]: { label: '大', px: 1200 },
  [LayoutWidth.XL]: { label: '特大', px: 1400 },
  [LayoutWidth.FULL]: { label: '全幅', px: null },
  [LayoutWidth.CUSTOM]: { label: 'カスタム', px: null },
}

/**
 * コンテンツ幅プリセット
 */
export const CONTENT_WIDTH_PRESETS: Record<LayoutWidth, WidthPreset> = {
  [LayoutWidth.XS]: { label: '極小', px: 640 },
  [LayoutWidth.SM]: { label: '小', px: 720 },
  [LayoutWidth.MD]: { label: '中', px: 800 },
  [LayoutWidth.LG]: { label: '大', px: 900 },
  [LayoutWidth.XL]: { label: '特大', px: 1024 },
  [LayoutWidth.FULL]: { label: '全幅', px: null },
  [LayoutWidth.CUSTOM]: { label: 'カスタム', px: null },
}

// =============================================================================
// Container (Site Width) Style Functions
// =============================================================================

/**
 * サイト幅のクラス名を取得
 */
export function getContainerClass(config: LayoutConfig): string {
  const { containerWidth } = config

  // FULLの場合のみmax-w-fullを使用
  if (containerWidth === LayoutWidth.FULL) {
    return cn('mx-auto w-full px-4 sm:px-6 lg:px-8', 'max-w-full')
  }

  return 'mx-auto w-full px-4 sm:px-6 lg:px-8'
}

/**
 * サイト幅のstyleオブジェクトを取得
 */
export function getContainerStyle(config: LayoutConfig): CSSProperties | undefined {
  const { containerWidth, containerWidthCustom } = config

  // カスタム幅の場合
  if (containerWidth === LayoutWidth.CUSTOM && containerWidthCustom) {
    return {
      maxWidth: `${containerWidthCustom}px`,
    }
  }

  // FULL幅の場合はstyle不要
  if (containerWidth === LayoutWidth.FULL) {
    return undefined
  }

  // プリセット幅の場合
  const pxValue = SITE_WIDTH_PX_MAP[containerWidth]
  if (pxValue) {
    return {
      maxWidth: `${pxValue}px`,
    }
  }

  return undefined
}

// =============================================================================
// Content Style Functions
// =============================================================================

/**
 * コンテンツ幅のクラス名を取得
 */
export function getContentClass(config: LayoutConfig): string {
  const { contentWidth } = config

  // FULLの場合のみmax-w-fullを使用
  if (contentWidth === LayoutWidth.FULL) {
    return cn('mx-auto', 'max-w-full')
  }

  return 'mx-auto'
}

/**
 * コンテンツ幅のstyleオブジェクトを取得
 */
export function getContentStyle(config: LayoutConfig): CSSProperties | undefined {
  const { contentWidth, contentWidthCustom } = config

  // カスタム幅の場合
  if (contentWidth === LayoutWidth.CUSTOM && contentWidthCustom) {
    return {
      maxWidth: `${contentWidthCustom}px`,
    }
  }

  // FULL幅の場合はstyle不要
  if (contentWidth === LayoutWidth.FULL) {
    return undefined
  }

  // プリセット幅の場合
  const pxValue = CONTENT_WIDTH_PX_MAP[contentWidth]
  if (pxValue) {
    return {
      maxWidth: `${pxValue}px`,
    }
  }

  return undefined
}

// =============================================================================
// Combined Style Functions
// =============================================================================

/**
 * サイト幅のクラスとスタイルを一括取得
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
 * コンテンツ幅のクラスとスタイルを一括取得
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

type WidthOption = {
  value: LayoutWidth
  label: string
  description: string
}

/**
 * サイト幅の選択オプションを取得
 */
export function getSiteWidthOptions(includeCustom = true): WidthOption[] {
  const options: WidthOption[] = [
    { value: LayoutWidth.SM, label: '小 (1000px)', description: 'コンパクト' },
    { value: LayoutWidth.MD, label: '中 (1100px)', description: 'スタンダード' },
    { value: LayoutWidth.LG, label: '大 (1200px)', description: 'ワイド' },
    { value: LayoutWidth.XL, label: '特大 (1400px)', description: 'エクストラワイド' },
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

/**
 * コンテンツ幅の選択オプションを取得
 */
export function getContentWidthOptions(includeCustom = true): WidthOption[] {
  const options: WidthOption[] = [
    { value: LayoutWidth.XS, label: '極小 (640px)', description: '長文テキスト向け' },
    { value: LayoutWidth.SM, label: '小 (720px)', description: 'コンパクト' },
    { value: LayoutWidth.MD, label: '中 (800px)', description: 'スタンダード' },
    { value: LayoutWidth.LG, label: '大 (900px)', description: 'ワイド' },
    { value: LayoutWidth.XL, label: '特大 (1024px)', description: '画像・ギャラリー向け' },
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

/**
 * サイト幅のラベルを取得
 */
export function getSiteWidthLabel(width: LayoutWidth, customPx?: number | null): string {
  if (width === LayoutWidth.CUSTOM && customPx) {
    return `カスタム (${customPx}px)`
  }

  const preset = SITE_WIDTH_PRESETS[width]
  if (preset.px) {
    return `${preset.label} (${preset.px}px)`
  }
  return preset.label
}

/**
 * コンテンツ幅のラベルを取得
 */
export function getContentWidthLabel(width: LayoutWidth, customPx?: number | null): string {
  if (width === LayoutWidth.CUSTOM && customPx) {
    return `カスタム (${customPx}px)`
  }

  const preset = CONTENT_WIDTH_PRESETS[width]
  if (preset.px) {
    return `${preset.label} (${preset.px}px)`
  }
  return preset.label
}
