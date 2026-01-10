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

import { useState, useEffect, useCallback, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { AnimatePresence, motion } from 'motion/react'
import { ChevronLeft, ChevronRight, X } from 'lucide-react'
import { cn } from '@/lib/utils'

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
}

export interface CarouselSettings {
  animation: 'fade' | 'slideX' | 'slideY'
  duration: number // ミリ秒
  autoPlay: boolean
  pauseOnHover: boolean
  showArrows: boolean
  showIndicator: boolean
}

export interface AnnouncementBarCarouselProps {
  bars: AnnouncementBarItem[]
  settings: CarouselSettings
}

// =============================================================================
// Constants
// =============================================================================

const STORAGE_KEY = 'dismissed-announcement-bars'

// タイプ別デフォルトスタイル
const TYPE_STYLES: Record<string, { bg: string; text: string; hover: string }> = {
  info: {
    bg: 'bg-blue-600',
    text: 'text-white',
    hover: 'hover:text-blue-100',
  },
  warning: {
    bg: 'bg-amber-500',
    text: 'text-black',
    hover: 'hover:text-amber-900',
  },
  promo: {
    bg: 'bg-green-600',
    text: 'text-white',
    hover: 'hover:text-green-100',
  },
}

// アニメーションバリアント
const ANIMATION_VARIANTS = {
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
// Session Storage Utilities
// =============================================================================

const SESSION_STORAGE_CHANGE_EVENT = 'announcement-bar-dismissed'

function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const dismissed = sessionStorage.getItem(STORAGE_KEY)
    return dismissed ? JSON.parse(dismissed) : []
  } catch {
    return []
  }
}

function addDismissedId(id: string): void {
  try {
    const dismissed = getDismissedIds()
    if (!dismissed.includes(id)) {
      dismissed.push(id)
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(dismissed))
      // 同一タブ内の変更を検知するためにカスタムイベントを発火
      window.dispatchEvent(new CustomEvent(SESSION_STORAGE_CHANGE_EVENT))
    }
  } catch {
    // sessionStorageが使えない場合は無視
  }
}

function getServerSnapshot(): string[] {
  return []
}

// =============================================================================
// Component
// =============================================================================

export function AnnouncementBarCarousel({ bars, settings }: AnnouncementBarCarouselProps) {
  const [currentIndex, setCurrentIndex] = useState(0)
  const [isPaused, setIsPaused] = useState(false)

  // useSyncExternalStoreでセッションストレージを購読
  // storageイベント（他タブ）とカスタムイベント（同一タブ）の両方を監視
  const dismissedIds = useSyncExternalStore(
    useCallback((callback) => {
      window.addEventListener('storage', callback)
      window.addEventListener(SESSION_STORAGE_CHANGE_EVENT, callback)
      return () => {
        window.removeEventListener('storage', callback)
        window.removeEventListener(SESSION_STORAGE_CHANGE_EVENT, callback)
      }
    }, []),
    getDismissedIds,
    getServerSnapshot
  )

  // 非表示でないバーのみフィルタ
  const visibleBars = bars.filter((bar) => !dismissedIds.includes(bar.id))

  // currentIndexが範囲外になった場合の補正（visibleBarsが空の場合も考慮）
  const safeIndex = visibleBars.length === 0 ? 0 : (currentIndex >= visibleBars.length ? 0 : currentIndex)
  const currentBar = visibleBars[safeIndex]

  // 次へ
  const goNext = useCallback(() => {
    if (visibleBars.length === 0) return
    setCurrentIndex((prev) => (prev + 1) % visibleBars.length)
  }, [visibleBars.length])

  // 前へ
  const goPrev = useCallback(() => {
    if (visibleBars.length === 0) return
    setCurrentIndex((prev) => (prev - 1 + visibleBars.length) % visibleBars.length)
  }, [visibleBars.length])

  // 閉じる（現在のバーを非表示）
  // useSyncExternalStoreがカスタムイベントで変更を検知するため、localDismissed不要
  const handleDismiss = useCallback(() => {
    if (!currentBar) return
    addDismissedId(currentBar.id)
    // visibleBarsの更新後にsafeIndexで自動的に範囲外補正されるため、
    // ここでのsetCurrentIndexは不要
  }, [currentBar])

  // 自動切り替え
  useEffect(() => {
    if (!settings.autoPlay || isPaused || visibleBars.length <= 1) {
      return
    }

    const timer = setInterval(goNext, settings.duration)
    return () => clearInterval(timer)
  }, [settings.autoPlay, settings.duration, isPaused, goNext, visibleBars.length])

  // バーがなくなったら非表示（すべてのHooksの後に配置）
  // 注: currentIndexの範囲外補正はsafeIndexで行っているため、useEffectでのsetStateは不要
  if (visibleBars.length === 0 || !currentBar) {
    return null
  }

  // スタイル計算
  const defaultStyle = TYPE_STYLES[currentBar.type] || TYPE_STYLES.info
  const hasCustomBg = !!currentBar.bgColor
  const hasCustomText = !!currentBar.textColor
  const customStyles: React.CSSProperties = {}
  if (currentBar.bgColor) customStyles.backgroundColor = currentBar.bgColor
  if (currentBar.textColor) customStyles.color = currentBar.textColor

  // アニメーションバリアント
  const variants = ANIMATION_VARIANTS[settings.animation]

  return (
    <div
      className={cn(
        'relative z-50 flex items-center justify-center px-4 py-2 text-sm',
        !hasCustomBg && defaultStyle.bg,
        !hasCustomText && defaultStyle.text
      )}
      style={customStyles}
      role="alert"
      onMouseEnter={() => settings.pauseOnHover && setIsPaused(true)}
      onMouseLeave={() => settings.pauseOnHover && setIsPaused(false)}
    >
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
        <AnimatePresence mode="wait">
          <motion.div
            key={currentBar.id}
            variants={variants}
            initial="initial"
            animate="animate"
            exit="exit"
            transition={{ duration: 0.3 }}
            className="flex items-center gap-2"
          >
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
          </motion.div>
        </AnimatePresence>
      </div>

      {/* インジケーター */}
      {settings.showIndicator && visibleBars.length > 1 && (
        <span className="absolute right-12 text-xs opacity-70">
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
  )
}
