'use client'

/**
 * お知らせバーコンポーネント
 *
 * サイト上部に表示するお知らせバー
 * - 閉じるボタンでセッション中は非表示
 * - タイプ別のスタイル（info/warning/promo）
 * - カスタム色対応
 */

import { useState, useSyncExternalStore } from 'react'
import Link from 'next/link'
import { X } from 'lucide-react'
import { cn } from '@/lib/utils'

export interface AnnouncementBarProps {
  id: string
  message: string
  type: string
  linkUrl?: string | null
  linkText?: string | null
  bgColor?: string | null
  textColor?: string | null
}

const STORAGE_KEY = 'dismissed-announcement-bars'

// セッションストレージから非表示IDリストを取得
function getDismissedIds(): string[] {
  if (typeof window === 'undefined') return []
  try {
    const dismissed = sessionStorage.getItem(STORAGE_KEY)
    return dismissed ? JSON.parse(dismissed) : []
  } catch {
    return []
  }
}

// サーバーサイドでは非表示として扱う（hydration対策）
function getServerSnapshot(): string[] {
  return []
}

// useSyncExternalStore用のsubscribe関数（コンポーネント外で定義して参照を安定させる）
function subscribeToStorage(callback: () => void): () => void {
  window.addEventListener('storage', callback)
  return () => window.removeEventListener('storage', callback)
}

export function AnnouncementBar({
  id,
  message,
  type,
  linkUrl,
  linkText,
  bgColor,
  textColor,
}: AnnouncementBarProps) {
  const [forceUpdate, setForceUpdate] = useState(0)

  // useSyncExternalStoreでセッションストレージを購読
  const dismissedIds = useSyncExternalStore(
    subscribeToStorage,
    getDismissedIds,
    getServerSnapshot
  )

  // forceUpdateで再レンダリングをトリガー
  const isDismissed = dismissedIds.includes(id) || forceUpdate < 0

  const handleDismiss = () => {
    try {
      const dismissed = sessionStorage.getItem(STORAGE_KEY)
      const currentDismissedIds: string[] = dismissed ? JSON.parse(dismissed) : []
      if (!currentDismissedIds.includes(id)) {
        currentDismissedIds.push(id)
        sessionStorage.setItem(STORAGE_KEY, JSON.stringify(currentDismissedIds))
      }
    } catch {
      // sessionStorageが使えない場合は無視
    }
    // forceUpdateを負の値にして非表示にする
    setForceUpdate(-1)
  }

  if (isDismissed) {
    return null
  }

  // タイプ別のデフォルトスタイル
  const typeStyles: Record<string, { bg: string; text: string; hover: string }> = {
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

  const defaultStyle = typeStyles[type] || typeStyles.info
  const hasCustomBg = !!bgColor
  const hasCustomText = !!textColor

  const customStyles: React.CSSProperties = {}
  if (bgColor) customStyles.backgroundColor = bgColor
  if (textColor) customStyles.color = textColor

  return (
    <div
      className={cn(
        'relative z-50 flex items-center justify-center gap-2 px-4 py-2 text-sm',
        !hasCustomBg && defaultStyle.bg,
        !hasCustomText && defaultStyle.text
      )}
      style={customStyles}
      role="alert"
    >
      <span className="text-center">{message}</span>

      {linkUrl && linkText && (
        <Link
          href={linkUrl}
          className={cn(
            'ml-1 underline underline-offset-2 transition-colors',
            !hasCustomText && defaultStyle.hover
          )}
          target={linkUrl.startsWith('http') ? '_blank' : undefined}
          rel={linkUrl.startsWith('http') ? 'noopener noreferrer' : undefined}
        >
          {linkText}
        </Link>
      )}

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
