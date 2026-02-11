'use client'

import { useSyncExternalStore } from 'react'
import type { ThemeColors } from '../types'

const DEFAULT_COLORS: ThemeColors = {
  primary: '#6366f1',
  background: '#ffffff',
  foreground: '#0a0a0a',
  accent: '#f4f4f5',
}

const CSS_VAR_MAP = {
  primary: '--color-primary',
  background: '--color-background',
  foreground: '--color-foreground',
  accent: '--color-accent',
} as const

/** 解決済みカラーのキャッシュ（セッション中1回のみ計算） */
let cachedColors: ThemeColors | null = null

function resolveThemeColors(): ThemeColors {
  if (cachedColors) return cachedColors

  if (typeof window === 'undefined') return DEFAULT_COLORS

  const computedStyle = getComputedStyle(document.documentElement)
  const resolved: Record<string, string> = {}

  for (const [key, cssVar] of Object.entries(CSS_VAR_MAP)) {
    const value = computedStyle.getPropertyValue(cssVar).trim()
    if (value) {
      resolved[key] = resolveColorToHex(value)
    }
  }

  cachedColors = {
    primary: resolved['primary'] ?? DEFAULT_COLORS.primary,
    background: resolved['background'] ?? DEFAULT_COLORS.background,
    foreground: resolved['foreground'] ?? DEFAULT_COLORS.foreground,
    accent: resolved['accent'] ?? DEFAULT_COLORS.accent,
  }

  return cachedColors
}

function subscribeToThemeColors(_callback: () => void): () => void {
  // テーマ色はセッション中不変。購読不要。
  return () => {}
}

function getSnapshot(): ThemeColors {
  return resolveThemeColors()
}

function getServerSnapshot(): ThemeColors {
  return DEFAULT_COLORS
}

/**
 * CSS カスタムプロパティから色を取得し Three.js で使える文字列に変換。
 * useSyncExternalStore で React Compiler 互換。
 * oklch() → computed style → hex 文字列。
 */
export function useThemeColors(): ThemeColors {
  return useSyncExternalStore(subscribeToThemeColors, getSnapshot, getServerSnapshot)
}

/**
 * CSS色文字列（oklch含む）をhex文字列に変換。
 * 2D canvas の fillStyle を使ってブラウザに色解決を委譲。
 */
function resolveColorToHex(cssColor: string): string {
  try {
    const canvas = document.createElement('canvas')
    canvas.width = 1
    canvas.height = 1
    const ctx = canvas.getContext('2d')
    if (!ctx) return cssColor

    ctx.fillStyle = cssColor
    ctx.fillRect(0, 0, 1, 1)
    const [r, g, b] = ctx.getImageData(0, 0, 1, 1).data

    if (r === undefined || g === undefined || b === undefined) return cssColor

    return `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`
  } catch {
    return cssColor
  }
}
