/**
 * CTAボタン カスタムカラーユーティリティ
 *
 * backgroundColor / textColor が設定されている場合にインラインstyleで
 * variantの色を上書きする。未設定時は従来のvariantクラスをそのまま使用。
 */

import type { CTAButtonItem } from '@/shared/lib/validations/section-design'
import type { CSSProperties } from 'react'

/**
 * カスタムカラーが設定されているボタンにインラインstyleを生成
 * 未設定の場合は undefined を返す（style prop を省略可能）
 */
export function getCustomColorStyle(button: CTAButtonItem): CSSProperties | undefined {
  if (!button.backgroundColor && !button.textColor) return undefined

  const style: CSSProperties = {}

  if (button.backgroundColor) {
    style.backgroundColor = button.backgroundColor
    // outlineバリアントではborderColorも上書き
    if (button.variant === 'outline') {
      style.borderColor = button.backgroundColor
    }
  }

  if (button.textColor) {
    style.color = button.textColor
  }

  return style
}

/**
 * カスタムカラー適用時のホバークラス
 * filter: brightness で汎用的にホバー効果を提供
 */
export const CUSTOM_COLOR_HOVER_CLASS = 'hover:brightness-90 transition-[filter]'

/**
 * カスタムカラーが設定されているか判定
 */
export function hasCustomColors(button: CTAButtonItem): boolean {
  return Boolean(button.backgroundColor || button.textColor)
}
