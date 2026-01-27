'use client'

/**
 * ResponsiveSidebar
 *
 * レスポンシブ対応サイドバー
 * - デスクトップ: 固定表示 (w-64)
 * - モバイル: ドロワー (スライドイン)
 */

import { useEffect, useRef, type ReactNode } from 'react'
import { tv } from 'tailwind-variants'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { X } from 'lucide-react'
import { useAdminLayout } from '@/admin/contexts/admin-layout-context'
import { Button } from '@/admin/components/ui'
import { SIDEBAR_ITEMS } from './sidebar-items'
import { Z_INDEX } from '@/admin/lib/styles/z-index'

const styles = tv({
  slots: {
    overlay: [
      'fixed inset-0 bg-black/50 transition-opacity duration-300',
      'lg:hidden',
    ],
    sidebar: [
      'fixed inset-y-0 left-0 bg-gray-900 text-white transition-transform duration-300',
      'flex flex-col w-64',
    ],
    logo: 'flex h-16 items-center justify-center border-b border-gray-800 text-xl font-bold',
    nav: 'flex-1 overflow-y-auto px-3 py-6',
    navItem: [
      'flex items-center gap-3 rounded-lg px-3 py-2 text-gray-300',
      'transition-colors hover:bg-gray-800 hover:text-white',
    ],
    navItemActive: 'bg-gray-800 text-white',
    closeButton: 'absolute right-3 top-3 lg:hidden',
    userSection: 'border-t border-gray-800 p-4',
  },
  variants: {
    isOpen: {
      true: {
        overlay: 'opacity-100',
        sidebar: 'translate-x-0',
      },
      false: {
        overlay: 'opacity-0 pointer-events-none',
        sidebar: '-translate-x-full lg:translate-x-0',
      },
    },
    isFullscreen: {
      true: {
        overlay: 'opacity-0 pointer-events-none',
        // lg:でも非表示にするため lg:-translate-x-full を追加
        sidebar: '-translate-x-full lg:-translate-x-full',
      },
    },
  },
})

type ResponsiveSidebarProps = {
  userInfo: ReactNode
}

export function ResponsiveSidebar({ userInfo }: ResponsiveSidebarProps) {
  const { sidebarState, closeSidebar, isMobile, isFullscreen, hasMounted } = useAdminLayout()
  const pathname = usePathname()
  const sidebarRef = useRef<HTMLElement>(null)

  // Hydration対策: マウント前はSSR時と同じ値を使用
  // SSR時: sidebarState='expanded', isMobile=false → isOpen=true
  const isOpen = hasMounted ? sidebarState === 'expanded' : true
  const effectiveIsMobile = hasMounted && isMobile
  const classes = styles({ isOpen, isFullscreen })

  // ESCキーで閉じる
  useEffect(() => {
    if (!effectiveIsMobile || !isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        closeSidebar()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [effectiveIsMobile, isOpen, closeSidebar])

  // スクロール禁止
  useEffect(() => {
    if (effectiveIsMobile && isOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }
    return () => document.body.classList.remove('overflow-hidden')
  }, [effectiveIsMobile, isOpen])

  return (
    <>
      {/* オーバーレイ (モバイル) */}
      <div
        className={classes.overlay()}
        style={{ zIndex: Z_INDEX.overlay }}
        onClick={closeSidebar}
        aria-hidden="true"
      />

      {/* サイドバー */}
      <aside
        ref={sidebarRef}
        className={classes.sidebar()}
        style={{ zIndex: Z_INDEX.sidebar }}
        aria-label="メインナビゲーション"
      >
        {/* 閉じるボタン (モバイル) */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={closeSidebar}
          className={classes.closeButton()}
          aria-label="メニューを閉じる"
        >
          <X className="h-5 w-5" />
        </Button>

        {/* ロゴ */}
        <div className={classes.logo()}>
          <Link href="/admin">管理画面</Link>
        </div>

        {/* ナビゲーション */}
        <nav className={classes.nav()}>
          <ul className="space-y-1">
            {SIDEBAR_ITEMS.map((item) => {
              const isActive =
                pathname === item.href ||
                (item.href !== '/admin' && pathname.startsWith(item.href + '/'))
              return (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className={`${classes.navItem()} ${isActive ? classes.navItemActive() : ''}`}
                    onClick={() => effectiveIsMobile && closeSidebar()}
                  >
                    {item.icon}
                    <span className="text-sm font-medium">{item.label}</span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>

        {/* ユーザー情報 */}
        <div className={classes.userSection()}>{userInfo}</div>
      </aside>
    </>
  )
}
