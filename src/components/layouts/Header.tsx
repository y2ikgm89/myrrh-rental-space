/**
 * ヘッダーコンポーネント
 *
 * - DB からナビゲーションアイテムを取得
 * - レスポンシブ対応（モバイルメニュー）
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでナビゲーションと設定をキャッシュ
 */

import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/lib/prisma'
import type { Settings } from '@/generated/prisma/client/client'
import { MobileMenu, type NavItem } from './MobileMenu'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/lib/errors'

async function getDesktopNavigationItems(): Promise<NavItem[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('navigation')

  return safeFetch({
    fetch: () =>
      prisma.navigationItem.findMany({
        where: { type: 'HEADER_DESKTOP', isActive: true },
        orderBy: { order: 'asc' },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: 'getDesktopNavigationItems',
    context: { component: 'Header', type: 'HEADER_DESKTOP' },
  })
}

async function getMobileNavigationItems(): Promise<NavItem[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('navigation')

  return safeFetch({
    fetch: () =>
      prisma.navigationItem.findMany({
        where: { type: 'HEADER_MOBILE', isActive: true },
        orderBy: { order: 'asc' },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: 'getMobileNavigationItems',
    context: { component: 'Header', type: 'HEADER_MOBILE' },
  })
}

async function getSiteSettings(): Promise<Pick<Settings, 'siteName'> | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings')

  return safeFetch({
    fetch: () => prisma.settings.findFirst({ select: { siteName: true } }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getSiteSettings',
    context: { component: 'Header' },
  })
}

export async function Header(): Promise<React.ReactElement> {
  const [desktopNavItems, mobileNavItems, settings] = await Promise.all([
    getDesktopNavigationItems(),
    getMobileNavigationItems(),
    getSiteSettings(),
  ])

  const siteName = settings?.siteName ?? 'Myrrh Rental Space'

  // デフォルトナビゲーション（DB未設定時）
  const defaultNavItems: NavItem[] = [
    { label: 'ホーム', url: '/' },
    { label: 'スペース', url: '/spaces' },
    { label: '料金', url: '/pricing' },
    { label: 'お問い合わせ', url: '/contact' },
  ]

  // デスクトップ用アイテム
  const desktopItems: NavItem[] = desktopNavItems.length > 0 ? desktopNavItems : defaultNavItems
  // モバイル用アイテム（モバイル用が未設定の場合はデスクトップと同じ）
  const mobileItems: NavItem[] = mobileNavItems.length > 0 ? mobileNavItems : desktopItems

  return (
    <header className="sticky top-0 z-50 w-full border-b bg-white/95 backdrop-blur supports-[backdrop-filter]:bg-white/60">
      <div className="container mx-auto flex h-16 items-center justify-between px-4">
        {/* ロゴ */}
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-xl font-bold text-gray-900">{siteName}</span>
        </Link>

        {/* デスクトップナビゲーション */}
        <nav className="hidden md:flex items-center space-x-6">
          {desktopItems.map((item, index) => (
            <Link
              key={item.url || index}
              href={item.url}
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* モバイルメニュー（モバイル用アイテムを渡す） */}
        <MobileMenu items={mobileItems} />
      </div>
    </header>
  )
}
