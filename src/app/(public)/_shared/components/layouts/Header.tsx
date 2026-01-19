/**
 * ヘッダーコンポーネント
 *
 * - DB からナビゲーションアイテムを取得
 * - レスポンシブ対応（モバイルメニュー）
 * - ロゴ/テキスト表示の切り替え対応
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでナビゲーションと設定をキャッシュ
 */

import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import type { Settings } from '@/shared/generated/prisma/client'
import { MobileMenu, type NavItem } from './MobileMenu'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { HeaderBranding } from './HeaderBranding'
import { SITE_DEFAULTS } from '@/shared/lib/constants'

type HeaderSettings = Pick<Settings, 'siteName' | 'headerLogoUrl' | 'useHeaderLogo'>

async function getDesktopNavigationItems(): Promise<NavItem[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('navigation')

  const items = await safeFetch({
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
  // Prisma オブジェクトをプレーンオブジェクトに変換（Client Component 用）
  return items.map((item) => ({ label: item.label, url: item.url }))
}

async function getMobileNavigationItems(): Promise<NavItem[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('navigation')

  const items = await safeFetch({
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
  // Prisma オブジェクトをプレーンオブジェクトに変換（Client Component 用）
  return items.map((item) => ({ label: item.label, url: item.url }))
}

async function getHeaderSettings(): Promise<HeaderSettings | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings')

  return safeFetch({
    fetch: () =>
      prisma.settings.findFirst({
        select: {
          siteName: true,
          headerLogoUrl: true,
          useHeaderLogo: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getHeaderSettings',
    context: { component: 'Header' },
  })
}

export async function Header(): Promise<React.ReactElement> {
  const [desktopNavItems, mobileNavItems, settings] = await Promise.all([
    getDesktopNavigationItems(),
    getMobileNavigationItems(),
    getHeaderSettings(),
  ])

  const siteName = settings?.siteName ?? SITE_DEFAULTS.name
  const headerLogoUrl = settings?.headerLogoUrl ?? null
  const useHeaderLogo = settings?.useHeaderLogo ?? true

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
        {/* ロゴ/サイト名 */}
        <Link href="/" className="flex items-center space-x-2">
          <HeaderBranding
            siteName={siteName}
            logoUrl={headerLogoUrl}
            useLogo={useHeaderLogo}
          />
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
