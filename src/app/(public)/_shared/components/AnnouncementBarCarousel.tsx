'use client'

/**
 * お知らせバーカルーセルコンポーネント
 *
 * サイト上部に表示するお知らせバー（複数対応）
 * - 複数のお知らせをアニメーションで切り替え
 * - アニメーション種類: fade, slideX, slideY
 * - 自動切り替え（設定可能）
 * - ホバー時一時停止
 * - 矢印ボタンで手動切り替え
 * - インジケーター（1/3形式）
 * - 閉じるボタンでセッション中は非表示
 */

import { useState, useEffect, useRef, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { gsap } from '@/public/lib/gsap-config'
import { cn } from '@/shared/lib/utils'
import {
  TYPE_STYLES,
  DEFAULT_TYPE_STYLE,
  DESIGN_STYLE_CLASSES,
  getStripedStyle,
  getTypeHexColor,
  getGradientAnimationStyle,
  getGlassShimmerStyle,
  type DesignStyle,
  type AnimationType,
} from '@/shared/lib/announcement-bar-utils'
import { AnnouncementBarDesignStyle } from '@/shared/generated/prisma/enums'

// =============================================================================
// Types
// =============================================================================

export interface AnnouncementBarItem {
  id: string
  message: string
  type: string
  linkUrl?: string | null
  linkText?: string | null
  bgColor?: string | null
  textColor?: string | null
  startAt?: Date | string | null
  endAt?: Date | string | null
}

export type { DesignStyle, AnimationType }

export interface CarouselSettings {
  animation: AnimationType
  duration: number // ミリ秒
  autoPlay: boolean
  pauseOnHover: boolean
  showArrows: boolean
  showIndicator: boolean
  designStyle: DesignStyle
  // Common Color Settings
  bgColor: string | null
  textColor: string | null
  // Striped Design Settings
  stripeColor: string | null
  stripeAnimation: boolean
  // Gradient Design Settings
  gradientAnimation: boolean
  // Glass Design Settings
  glassAnimation: boolean
  // Sticky Settings
  sticky: boolean
}

export interface AnnouncementBarCarouselProps {
  bars: AnnouncementBarItem[]
  settings: CarouselSettings
}

// =============================================================================
// Animation config
// =============================================================================

const ENTER_FROM_PROPS: Record<AnimationType, gsap.TweenVars> = {
  fade: { opacity: 0 },
  slideX: { opacity: 0, x: 50 },
  slideY: { opacity: 0, y: -20 },
}

const ENTER_TO_PROPS: Record<AnimationType, gsap.TweenVars> = {
  fade: { opacity: 1 },
  slideX: { opacity: 1, x: 0 },
  slideY: { opacity: 1, y: 0 },
}

const TRANSITION_DURATION = 0.3

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'dismissed-announcement-bars'

/**
 * 表示期間内かどうかをチェック
 * サーバーサイドでは new Date() が使えないため、クライアントサイドでフィルタリング
 */
function isWithinDisplayPeriod(bar: AnnouncementBarItem): boolean {
  const now = new Date()

  // startAtとendAtをDateオブジェクトに変換
  const startAt = bar.startAt ? new Date(bar.startAt) : null
  const endAt = bar.endAt ? new Date(bar.endAt) : null

  // 期間指定なし → 常に表示
  if (!startAt && !endAt) return true

  // 開始日のみ指定 → 開始日以降なら表示
  if (startAt && !endAt) return now >= startAt

  // 終了日のみ指定 → 終了日以前なら表示
  if (!startAt && endAt) return now <= endAt

  // 両方指定 → 期間内なら表示
  return now >= startAt! && now <= endAt!
}

// =============================================================================
// Session Storage Utilities
// =============================================================================

const SESSION_STORAGE_CHANGE_EVENT = 'announcement-bar-dismissed'

// スナップショットのキャッシュ（参照を安定させるため）
let cachedDismissedIds: string[] = []
let cachedDismissedIdsJson = ''

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return cachedDismissedIds
  try {
    const json = sessionStorage.getItem(STORAGE_KEY) ?? ''
    // JSONが変わった場合のみ新しい配列を作成
    if (json !== cachedDismissedIdsJson) {
      cachedDismissedIdsJson = json
      cachedDismissedIds = json ? JSON.parse(json) : []
    }
    return cachedDismissedIds
  } catch {
    return cachedDismissedIds
  }
}

function addDismissedId(id: string): void {
  try {
    const dismissed = getDismissedIds()
    if (!dismissed.includes(id)) {
      const newDismissed = [...dismissed, id]
      const json = JSON.stringify(newDismissed)
      sessionStorage.setItem(STORAGE_KEY, json)
      // キャッシュを更新
      cachedDismissedIdsJson = json
      cachedDismissedIds = newDismissed
      // 同一タブ内の変更を検知するためにカスタムイベントを発火
      window.dispatchEvent(new CustomEvent(SESSION_STORAGE_CHANGE_EVENT))
    }
  } catch {
    // sessionStorageが使えない場合は無視
  }
}

function getServerSnapshot(): string[] {
  return cachedDismissedIds
}

// useSyncExternalStore用のsubscribe関数（コンポーネント外で定義して参照を安定させる）
function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  window.addEventListener(SESSION_STORAGE_CHANGE_EVENT, callback)
  return () => {
    window.removeEventListener('storage', callback)
    window.removeEventListener(SESSION_STORAGE_CHANGE_EVENT, callback)
  }
}

// =============================================================================
// Component
// =============================================================================

export function AnnouncementBarCarousel({ bars, settings }: AnnouncementBarCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)
  const contentRef = useRef<HTMLDivElement>(null)
  const barContainerRef = useRef<HTMLDivElement>(null)
  const isAnimatingRef = useRef(false)
  const prevBarIdRef = useRef<string | null>(null)

  // useSyncExternalStoreでセッションストレージを購読
  // storageイベント（他タブ）とカスタムイベント（同一タブ）の両方を監視
  const dismissedIds = useSyncExternalStore(
    subscribeToStorage,
    getDismissedIds,
    getServerSnapshot
  )

  // 非表示でないバーかつ表示期間内のもののみフィルタ
  const visibleBars = bars.filter(
    (bar) => !dismissedIds.includes(bar.id) && isWithinDisplayPeriod(bar)
  )

  // currentIndexが範囲外になった場合の補正（visibleBarsが空の場合も考慮）
  const safeIndex = visibleBars.length === 0 ? 0 : (currentIndex >= visibleBars.length ? 0 : currentIndex)
  const currentBar = visibleBars[safeIndex]

  // sticky: ResizeObserver で高さ計測 → CSS変数を設定
  useEffect(() => {
    if (!settings.sticky) return

    const el = barContainerRef.current
    if (!el) return

    // バーが非表示の場合は CSS変数を 0px にリセット
    if (visibleBars.length === 0) {
      document.documentElement.style.setProperty('--announcement-bar-height', '0px')
      return
    }

    const updateHeight = () => {
      const height = el.getBoundingClientRect().height
      document.documentElement.style.setProperty('--announcement-bar-height', `${height}px`)
    }

    const ro = new ResizeObserver(updateHeight)
    ro.observe(el)
    updateHeight()

    return () => {
      ro.disconnect()
      document.documentElement.style.setProperty('--announcement-bar-height', '0px')
    }
  }, [settings.sticky, visibleBars.length])

  // currentBar が変わったら GSAP でトランジション
  useEffect(() => {
    if (!currentBar || !contentRef.current) return

    // 初回表示 — アニメーション不要
    if (prevBarIdRef.current === null) {
      prevBarIdRef.current = currentBar.id
      return
    }

    // 同一バー or アニメーション中
    if (prevBarIdRef.current === currentBar.id || isAnimatingRef.current) return

    prevBarIdRef.current = currentBar.id
    isAnimatingRef.current = true

    // React が新コンテンツをレンダリング済み → 即座に非表示位置にセットし、入場アニメーション
    gsap.fromTo(contentRef.current, ENTER_FROM_PROPS[settings.animation], {
      ...ENTER_TO_PROPS[settings.animation],
      duration: TRANSITION_DURATION,
      ease: 'power2.out',
      onComplete: () => {
        isAnimatingRef.current = false
      },
    })
  }, [currentBar, settings.animation])

  // 次へ
  const goNext = () => {
    if (visibleBars.length === 0 || isAnimatingRef.current) return
    setCurrentIndex((prev) => (prev + 1) % visibleBars.length)
  }

  // 前へ
  const goPrev = () => {
    if (visibleBars.length === 0 || isAnimatingRef.current) return
    setCurrentIndex((prev) => (prev - 1 + visibleBars.length) % visibleBars.length)
  }

  // 閉じる（現在のバーを非表示）
  const handleDismiss = () => {
    if (!currentBar) return
    addDismissedId(currentBar.id)
  }

  // 自動切り替え
  useEffect(() => {
    if (!settings.autoPlay || isPaused || visibleBars.length <= 1) {
      return
    }

    const timer = setInterval(() => {
      if (!isAnimatingRef.current) {
        setCurrentIndex((prev) => (prev + 1) % visibleBars.length)
      }
    }, settings.duration)
    return () => clearInterval(timer)
  }, [settings.autoPlay, settings.duration, isPaused, visibleBars.length])

  // バーがなくなったら非表示
  if (visibleBars.length === 0 || !currentBar) {
    return null
  }

  // スタイル計算（共通カラー設定を優先）
  const defaultStyle = TYPE_STYLES[currentBar.type] ?? DEFAULT_TYPE_STYLE
  // 共通カラー設定があればそれを使用
  const bgColor = settings.bgColor || null
  const textColor = settings.textColor || null
  const hasCustomBg = !!bgColor
  const hasCustomText = !!textColor
  const customStyles: React.CSSProperties = {}
  if (bgColor) customStyles.backgroundColor = bgColor
  if (textColor) customStyles.color = textColor

  // デザインスタイル
  const designStyle = settings.designStyle || AnnouncementBarDesignStyle.solid
  const styleConfig = DESIGN_STYLE_CLASSES[designStyle]
  const needsDefaultText = !hasCustomText && (designStyle === AnnouncementBarDesignStyle.solid || designStyle === AnnouncementBarDesignStyle.gradient || designStyle === AnnouncementBarDesignStyle.striped)

  // Stripedスタイルの場合、ストライプ背景を追加
  if (designStyle === AnnouncementBarDesignStyle.striped) {
    const baseHexColor = bgColor || getTypeHexColor(currentBar.type)
    const stripedStyles = getStripedStyle(baseHexColor, settings.stripeColor, settings.stripeAnimation)
    Object.assign(customStyles, stripedStyles)
  }

  // Gradientスタイルのアニメーション
  if (designStyle === AnnouncementBarDesignStyle.gradient && settings.gradientAnimation) {
    Object.assign(customStyles, getGradientAnimationStyle(true))
  }

  // Glassスタイルのアニメーション
  if (designStyle === AnnouncementBarDesignStyle.glass && settings.glassAnimation) {
    Object.assign(customStyles, getGlassShimmerStyle(true))
  }

  return (
    <>
      {/* ストライプアニメーション用のスタイル */}
      {designStyle === AnnouncementBarDesignStyle.striped && settings.stripeAnimation && (
        <style>{`
          @keyframes stripe-slide {
            from { background-position: 0 0; }
            to { background-position: 28.28px 0; }
          }
        `}</style>
      )}
      {/* グラデーションアニメーション用のスタイル */}
      {designStyle === AnnouncementBarDesignStyle.gradient && settings.gradientAnimation && (
        <style>{`
          @keyframes gradient-flow {
            0% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
            100% { background-position: 0% 50%; }
          }
        `}</style>
      )}
      {/* グラスシマーアニメーション用のスタイル */}
      {designStyle === AnnouncementBarDesignStyle.glass && settings.glassAnimation && (
        <style>{`
          @keyframes glass-shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
          }
        `}</style>
      )}
      <div
        ref={barContainerRef}
        className={cn(
          'relative flex items-center justify-center px-4 py-2 text-sm',
          settings.sticky && 'sticky top-0 z-41',
          styleConfig.container,
          !hasCustomBg && styleConfig.containerWithBg(currentBar.type),
          styleConfig.border,
          needsDefaultText && defaultStyle.text,
          // outlined/glass/minimalではテキスト色をタイプカラーに
          !hasCustomText && (designStyle === AnnouncementBarDesignStyle.outlined || designStyle === AnnouncementBarDesignStyle.minimal) && 'text-foreground',
          // design-exception: frosted-glass overlay requires white text regardless of theme
          !hasCustomText && designStyle === AnnouncementBarDesignStyle.glass && 'text-white'
        )}
        style={customStyles}
        role="alert"
        onMouseEnter={() => settings.pauseOnHover && setIsPaused(true)}
        onMouseLeave={() => settings.pauseOnHover && setIsPaused(false)}
      >
      {/* グラスシマーオーバーレイ */}
      {designStyle === AnnouncementBarDesignStyle.glass && settings.glassAnimation && (
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

      {/* 左矢印 */}
      {settings.showArrows && visibleBars.length > 1 && (
        <button
          onClick={goPrev}
          className={cn(
            'absolute left-2 rounded-full p-1 transition-colors',
            !hasCustomText && 'hover:bg-black/10'
          )}
          aria-label="前のお知らせ"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
      )}

      {/* コンテンツ */}
      <div className="mx-8 flex min-h-[1.5rem] items-center justify-center gap-2 overflow-hidden">
        <div ref={contentRef} className="flex items-center gap-2">
          <span className="text-center">{currentBar.message}</span>
          {currentBar.linkUrl && currentBar.linkText && (
            <Link
              href={currentBar.linkUrl}
              className={cn(
                'ml-1 whitespace-nowrap underline underline-offset-2 transition-colors',
                !hasCustomText && defaultStyle.hover
              )}
              target={currentBar.linkUrl.startsWith('http') ? '_blank' : undefined}
              rel={currentBar.linkUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
            >
              {currentBar.linkText}
            </Link>
          )}
        </div>
      </div>

      {/* インジケーター */}
      {settings.showIndicator && visibleBars.length > 1 && (
        <span className="absolute right-12 text-xs">
          {safeIndex + 1}/{visibleBars.length}
        </span>
      )}

      {/* 右矢印 */}
      {settings.showArrows && visibleBars.length > 1 && (
        <button
          onClick={goNext}
          className={cn(
            'absolute right-6 rounded-full p-1 transition-colors',
            !hasCustomText && 'hover:bg-black/10'
          )}
          aria-label="次のお知らせ"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
      )}

      {/* 閉じるボタン */}
      <button
        onClick={handleDismiss}
        className={cn(
          'absolute right-2 rounded-full p-1 transition-colors',
          !hasCustomText && 'hover:bg-black/10'
        )}
        aria-label="閉じる"
      >
        <X className="h-4 w-4" />
      </button>
      </div>
    </>
  )
}
