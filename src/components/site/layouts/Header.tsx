/**
 * ヘッダーコンポーネント
 *
 * - DB からナビゲーションアイテムを取得
 * - レスポンシブ対応（モバイルメニュー）
 */

import Link from 'next/link'
import { prisma } from '@/lib/prisma'
import type { Settings } from '@/generated/prisma/client/client'
import type { ReactElement } from 'react'

type NavItem = {
  label: string
  url: string
}

async function getDesktopNavigationItems(): Promise<NavItem[]> {
  try {
    const items = await prisma.navigationItem.findMany({
      where: {
        type: 'HEADER_DESKTOP',
        isActive: true,
      },
      orderBy: { order: 'asc' },
    })
    // Prisma オブジェクトをプレーンオブジェクトに変換
    return items.map((item) => ({
      label: item.label,
      url: item.url,
    }))
  } catch {
    // DB未接続時は空配列を返す
    return []
  }
}

async function getSiteSettings(): Promise<Settings | null> {
  try {
    const settings = await prisma.settings.findFirst()
    return settings
  } catch {
    return null
  }
}

export async function Header(): Promise<ReactElement> {
  const [navItems, settings] = await Promise.all([
    getDesktopNavigationItems(),
    getSiteSettings(),
  ])

  const siteName = settings?.siteName ?? 'Myrrh Rental Space'

  // デフォルトナビゲーション（DB未設定時）
  const defaultNavItems = [
    { label: 'ホーム', url: '/' },
    { label: 'スペース', url: '/spaces' },
    { label: '料金', url: '/pricing' },
    { label: 'お問い合わせ', url: '/contact' },
  ]

  const displayItems: NavItem[] = navItems.length > 0 ? navItems : defaultNavItems

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* ロゴ */}
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold text-gray-900">{siteName}</span>
        </Link>

        {/* デスクトップナビゲーション */}
        <nav className="hidden md:flex items-center space-x-6">
          {displayItems.map((item, index) => (
            <Link
              key={item.url || index}
              href={item.url}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* モバイルメニューボタン（後で実装） */}
        <button
          type="button"
          className="md:hidden p-2 text-gray-600 hover:text-gray-900"
          aria-label="メニューを開く"
        >
          <svg
            className="h-6 w-6"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M4 6h16M4 12h16M4 18h16"
            />
          </svg>
        </button>
      </div>
    </header>
  )
}
