'use client'

/**
 * モバイルメニューコンポーネント (Client Component)
 *
 * - ハンバーガーボタンでメニュー開閉
 * - 右からスライドインするドロワーメニュー
 * - メニュー外クリック・ESCキーで閉じる
 * - アクセシビリティ対応（フォーカス管理・フォーカストラップ）
 */

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

export type NavItem = {
  label: string
  url: string
}

type MobileMenuProps = {
  items: NavItem[]
}

export function MobileMenu({ items }: MobileMenuProps): React.ReactElement {
  const [isOpen, setIsOpen] = useState(false)
  const menuPanelRef = useRef<HTMLElement>(null)
  const buttonRef = useRef<HTMLButtonElement>(null)
  const firstLinkRef = useRef<HTMLAnchorElement>(null)
  const lastLinkRef = useRef<HTMLAnchorElement>(null)
  const pathname = usePathname()
  const prevPathnameRef = useRef(pathname)

  const closeMenu = (): void => {
    setIsOpen(false)
    // 閉じた後、ボタンにフォーカスを戻す
    buttonRef.current?.focus()
  }

  function toggleMenu(): void {
    setIsOpen((prev) => !prev)
  }

  // メニューを開いた時、最初のリンクにフォーカス
  useEffect(() => {
    if (isOpen && firstLinkRef.current) {
      // 少し遅延させてアニメーション後にフォーカス
      const timer = setTimeout(() => {
        firstLinkRef.current?.focus()
      }, 100)
      return () => clearTimeout(timer)
    }
  }, [isOpen])

  // ページ遷移時にメニューを閉じる（非同期でsetStateを呼び出して連鎖的な再レンダリングを回避）
  useEffect(() => {
    if (prevPathnameRef.current !== pathname) {
      prevPathnameRef.current = pathname
      // requestAnimationFrameを使用して非同期化
      requestAnimationFrame(() => setIsOpen(false))
    }
  }, [pathname])

  // ESCキー・メニュー外クリックで閉じる（メニューが開いている時のみ）
  useEffect(() => {
    if (!isOpen) return

    function handleKeyDown(e: KeyboardEvent): void {
      if (e.key === 'Escape') {
        closeMenu()
      }
    }

    function handleClickOutside(e: MouseEvent): void {
      const target = e.target as Node
      // ボタンとメニューパネル以外をクリックした場合のみ閉じる
      if (
        menuPanelRef.current &&
        !menuPanelRef.current.contains(target) &&
        buttonRef.current &&
        !buttonRef.current.contains(target)
      ) {
        closeMenu()
      }
    }

    document.addEventListener('keydown', handleKeyDown)
    document.addEventListener('mousedown', handleClickOutside)

    return () => {
      document.removeEventListener('keydown', handleKeyDown)
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  // フォーカストラップ（メニューが開いている時、Tab/Shift+Tabでメニュー内に閉じ込める）
  useEffect(() => {
    if (!isOpen) return

    function handleTabKey(e: KeyboardEvent): void {
      if (e.key !== 'Tab') return

      const focusableElements = menuPanelRef.current?.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
      )
      if (!focusableElements || focusableElements.length === 0) return

      const firstElement = focusableElements[0]
      const lastElement = focusableElements[focusableElements.length - 1]

      // Shift+Tab で最初の要素にいる場合、最後の要素へ
      if (e.shiftKey && document.activeElement === firstElement) {
        e.preventDefault()
        lastElement.focus()
      }
      // Tab で最後の要素にいる場合、最初の要素へ
      else if (!e.shiftKey && document.activeElement === lastElement) {
        e.preventDefault()
        firstElement.focus()
      }
    }

    document.addEventListener('keydown', handleTabKey)
    return () => document.removeEventListener('keydown', handleTabKey)
  }, [isOpen])

  // スクロール禁止（メニューが開いている時）- CSSクラスを使用
  useEffect(() => {
    if (isOpen) {
      document.body.classList.add('overflow-hidden')
    } else {
      document.body.classList.remove('overflow-hidden')
    }

    return () => {
      document.body.classList.remove('overflow-hidden')
    }
  }, [isOpen])

  return (
    <div className="md:hidden">
      {/* ハンバーガーボタン */}
      <button
        ref={buttonRef}
        type="button"
        onClick={toggleMenu}
        className="relative z-50 p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
        aria-label={isOpen ? 'メニューを閉じる' : 'メニューを開く'}
        aria-expanded={isOpen}
        aria-controls="mobile-menu"
      >
        <div className="relative h-6 w-6">
          {/* ハンバーガーアイコン → ×アイコン アニメーション */}
          <span
            className={`absolute left-0 block h-0.5 w-6 bg-current transition-all duration-300 ease-in-out ${
              isOpen ? 'top-3 rotate-45' : 'top-1'
            }`}
          />
          <span
            className={`absolute left-0 top-3 block h-0.5 w-6 bg-current transition-all duration-300 ease-in-out ${
              isOpen ? 'opacity-0' : 'opacity-100'
            }`}
          />
          <span
            className={`absolute left-0 block h-0.5 w-6 bg-current transition-all duration-300 ease-in-out ${
              isOpen ? 'top-3 -rotate-45' : 'top-5'
            }`}
          />
        </div>
      </button>

      {/* オーバーレイ */}
      <div
        className={`fixed inset-0 z-40 bg-black/50 transition-opacity duration-300 ${
          isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'
        }`}
        aria-hidden="true"
        onClick={closeMenu}
      />

      {/* スライドメニュー */}
      <nav
        ref={menuPanelRef}
        id="mobile-menu"
        role="dialog"
        aria-modal="true"
        aria-label="モバイルナビゲーション"
        className={`fixed right-0 top-0 z-40 h-full w-64 bg-white shadow-xl transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
        aria-hidden={!isOpen}
      >
        <div className="flex h-16 items-center justify-between border-b px-4">
          <span className="text-lg font-semibold text-gray-900">メニュー</span>
          {/* 閉じるボタン（メニュー内） */}
          <button
            type="button"
            onClick={closeMenu}
            className="p-2 text-gray-600 hover:text-gray-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-gray-500 focus-visible:ring-offset-2"
            aria-label="メニューを閉じる"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <ul className="space-y-1 p-4">
          {items.map((item, index) => {
            const isFirst = index === 0
            const isLast = index === items.length - 1
            return (
              <li key={item.url || index}>
                <Link
                  ref={isFirst ? firstLinkRef : isLast ? lastLinkRef : undefined}
                  href={item.url}
                  className={`block rounded-lg px-4 py-3 text-base font-medium transition-colors ${
                    pathname === item.url
                      ? 'bg-gray-100 text-gray-900'
                      : 'text-gray-600 hover:bg-gray-50 hover:text-gray-900'
                  }`}
                  onClick={closeMenu}
                >
                  {item.label}
                </Link>
              </li>
            )
          })}
        </ul>
      </nav>
    </div>
  )
}
