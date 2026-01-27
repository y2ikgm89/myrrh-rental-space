'use client'

import {
  TYPE_STYLES,
  getStripedStyle,
} from '@/shared/lib/announcement-bar-utils'
import { cn } from '@/shared/lib/utils'
import type { DesignPreviewProps } from './types'

export function DesignPreview({
  message,
  linkText,
  designStyle,
  bgColor,
  textColor,
  stripeColor,
  stripeAnimation,
  gradientAnimation,
  glassAnimation,
}: DesignPreviewProps): React.ReactElement {
  const defaultColors = TYPE_STYLES.info

  // スタイル計算
  const customStyles: React.CSSProperties = {}
  if (bgColor) customStyles.backgroundColor = bgColor
  if (textColor) customStyles.color = textColor

  // ストライプスタイル（共通ユーティリティを使用）
  if (designStyle === 'striped') {
    const baseColor = bgColor || defaultColors.hex
    const stripedStyles = getStripedStyle(baseColor, stripeColor, stripeAnimation)
    Object.assign(customStyles, stripedStyles)
  }

  // グラデーションアニメーション
  if (designStyle === 'gradient' && gradientAnimation) {
    customStyles.backgroundSize = '200% 100%'
    customStyles.animation = 'gradient-flow 3s ease infinite'
  }

  // グラスアニメーション用
  if (designStyle === 'glass' && glassAnimation) {
    customStyles.position = 'relative'
    customStyles.overflow = 'hidden'
  }

  // デザインスタイル別のクラス
  function getStyleClasses(): string {
    switch (designStyle) {
      case 'solid':
        return !bgColor ? defaultColors.bg : ''
      case 'gradient':
        return `bg-gradient-to-r ${defaultColors.gradient}`
      case 'outlined':
        return 'bg-transparent border-y border-gray-400'
      case 'glass':
        return 'backdrop-blur-md bg-white/10 border-y border-white/20'
      case 'minimal':
        return 'bg-transparent border-b border-gray-300'
      case 'striped':
        return !bgColor ? defaultColors.bg : ''
    }
  }

  function getTextClasses(): string {
    if (textColor) return ''
    switch (designStyle) {
      case 'solid':
      case 'gradient':
      case 'glass':
      case 'striped':
        return 'text-white'
      case 'outlined':
      case 'minimal':
        return 'text-gray-800'
    }
  }

  return (
    <>
      {designStyle === 'striped' && stripeAnimation && (
        <style>{`
          @keyframes stripe-slide {
            from { background-position: 0 0; }
            to { background-position: 28.28px 0; }
          }
        `}</style>
      )}
      {designStyle === 'gradient' && gradientAnimation && (
        <style>{`
          @keyframes gradient-flow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
      )}
      {designStyle === 'glass' && glassAnimation && (
        <style>{`
          @keyframes glass-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      )}
      <div
        className={cn(
          'flex items-center justify-center gap-2 px-4 py-2 text-sm',
          getStyleClasses(),
          getTextClasses()
        )}
        style={customStyles}
      >
        {/* グラスシマーオーバーレイ */}
        {designStyle === 'glass' && glassAnimation && (
          <div
            className="pointer-events-none absolute inset-0 overflow-hidden"
            aria-hidden="true"
          >
            <div
              className="absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/20 to-transparent"
              style={{ animation: 'glass-shimmer 3s ease-in-out infinite' }}
            />
          </div>
        )}
        <span>{message || 'サンプルお知らせメッセージ'}</span>
        {linkText && (
          <span className="underline underline-offset-2">{linkText}</span>
        )}
      </div>
    </>
  )
}
