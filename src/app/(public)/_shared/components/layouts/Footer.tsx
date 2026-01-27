/**
 * フッターコンポーネント
 *
 * - DB からフッターナビ・SNSリンクを取得
 * - コピーライト表示
 * - ロゴ/テキスト表示の切り替え対応
 *
 * Next.js 16 PPR対応:
 * - use cache ディレクティブでデータ取得をキャッシュ
 */

import Link from 'next/link'
import { cacheLife, cacheTag } from 'next/cache'
import { prisma } from '@/shared/lib/prisma'
import type { Settings } from '@/shared/generated/prisma/client'
import type { ReactElement } from 'react'
import { safeFetch, ErrorCategory, ErrorSeverity } from '@/shared/lib/errors'
import { toPlainObject } from '@/shared/lib/serialize'
import { FooterBranding } from './FooterBranding'
import { SITE_DEFAULTS } from '@/shared/lib/constants'

type NavItem = {
  label: string
  url: string
}

type SocialLinkItem = {
  id: string
  platform: string
  url: string
  showOnDesktop: boolean
  showOnMobile: boolean
}

/**
 * デバイス別表示のCSSクラスを取得
 */
function getVisibilityClass(showOnDesktop: boolean, showOnMobile: boolean): string {
  if (showOnDesktop && showOnMobile) {
    return '' // 両方表示
  }
  if (showOnDesktop && !showOnMobile) {
    return 'hidden md:inline-flex' // デスクトップのみ
  }
  if (!showOnDesktop && showOnMobile) {
    return 'md:hidden' // モバイルのみ
  }
  return 'hidden' // 両方非表示
}

async function getFooterNavItems(): Promise<NavItem[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('navigation')

  const items = await safeFetch({
    fetch: () =>
      prisma.navigationItem.findMany({
        where: { type: 'FOOTER', isActive: true },
        orderBy: { order: 'asc' },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.MEDIUM,
    operationName: 'getFooterNavItems',
    context: { component: 'Footer' },
  })
  // Prisma オブジェクトをプレーンオブジェクトに変換
  return items.map((item) => ({ label: item.label, url: item.url }))
}

async function getSocialLinks(): Promise<SocialLinkItem[]> {
  'use cache'
  cacheLife('hours')
  cacheTag('social-links')

  const links = await safeFetch({
    fetch: () =>
      prisma.socialLink.findMany({
        where: { isActive: true },
        select: {
          id: true,
          platform: true,
          url: true,
          showOnDesktop: true,
          showOnMobile: true,
        },
        orderBy: { order: 'asc' },
      }),
    fallback: [],
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getSocialLinks',
    context: { component: 'Footer' },
  })
  // Prisma オブジェクトをプレーンオブジェクトに変換
  return links.map((link) => ({
    id: link.id,
    platform: link.platform,
    url: link.url,
    showOnDesktop: link.showOnDesktop,
    showOnMobile: link.showOnMobile,
  }))
}

type FooterSettings = Pick<
  Settings,
  | 'siteName'
  | 'businessName'
  | 'postalCode'
  | 'prefecture'
  | 'city'
  | 'streetAddress'
  | 'buildingName'
  | 'address'
  | 'phoneNumber'
  | 'faxNumber'
  | 'email'
  | 'footerCopyright'
  | 'footerLogoUrl'
  | 'useFooterLogo'
>

async function getFooterSettings(): Promise<FooterSettings | null> {
  'use cache'
  cacheLife('hours')
  cacheTag('settings')

  const result = await safeFetch({
    fetch: () =>
      prisma.settings.findFirst({
        select: {
          siteName: true,
          businessName: true,
          postalCode: true,
          prefecture: true,
          city: true,
          streetAddress: true,
          buildingName: true,
          address: true,
          phoneNumber: true,
          faxNumber: true,
          email: true,
          footerCopyright: true,
          footerLogoUrl: true,
          useFooterLogo: true,
        },
      }),
    fallback: null,
    category: ErrorCategory.DATABASE,
    severity: ErrorSeverity.LOW,
    operationName: 'getFooterSettings',
    context: { component: 'Footer' },
  })

  return toPlainObject(result)
}

export async function Footer(): Promise<ReactElement> {
  const [navItems, socialLinks, settings] = await Promise.all([
    getFooterNavItems(),
    getSocialLinks(),
    getFooterSettings(),
  ])

  const siteName = settings?.siteName ?? SITE_DEFAULTS.name
  const businessName = settings?.businessName
  const footerLogoUrl = settings?.footerLogoUrl ?? null
  const useFooterLogo = settings?.useFooterLogo ?? true
  // Note: コピーライトは設定から取得、年はビルド時に固定される
  const copyrightText = settings?.footerCopyright ?? `© ${siteName}. All rights reserved.`

  // 住所の組み立て
  const addressParts = [
    settings?.postalCode ? `〒${settings.postalCode}` : null,
    settings?.prefecture,
    settings?.city,
    settings?.streetAddress,
    settings?.buildingName,
  ].filter(Boolean)
  const fullAddress = addressParts.length > 0 ? addressParts.join(' ') : settings?.address

  // デフォルトフッターナビ
  const defaultNavItems = [
    { label: 'プライバシーポリシー', url: '/privacy' },
    { label: '利用規約', url: '/terms' },
    { label: 'お問い合わせ', url: '/contact' },
  ]

  const displayItems: NavItem[] = navItems.length > 0 ? navItems : defaultNavItems

  return (
    <footer className="border-t bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        {/* フッターロゴ/サイト名 */}
        <div className="mb-6 flex justify-center">
          <Link href="/">
            <FooterBranding
              siteName={siteName}
              logoUrl={footerLogoUrl}
              useLogo={useFooterLogo}
            />
          </Link>
        </div>

        {/* 事業者情報 */}
        {(businessName || fullAddress || settings?.phoneNumber || settings?.email) && (
          <div className="mb-8 text-center">
            {businessName && (
              <p className="text-lg font-semibold text-gray-900 mb-2">{businessName}</p>
            )}
            <div className="space-y-1 text-sm text-gray-600">
              {fullAddress && <p>{fullAddress}</p>}
              {settings?.phoneNumber && (
                <p>
                  <span className="mr-2">TEL:</span>
                  <a href={`tel:${settings.phoneNumber}`} className="hover:text-gray-900">
                    {settings.phoneNumber}
                  </a>
                  {settings?.faxNumber && (
                    <span className="ml-4">
                      <span className="mr-2">FAX:</span>
                      {settings.faxNumber}
                    </span>
                  )}
                </p>
              )}
              {settings?.email && (
                <p>
                  <span className="mr-2">Email:</span>
                  <a href={`mailto:${settings.email}`} className="hover:text-gray-900">
                    {settings.email}
                  </a>
                </p>
              )}
            </div>
          </div>
        )}

        {/* フッターナビゲーション */}
        <nav className="flex flex-wrap justify-center gap-6 mb-6">
          {displayItems.map((item, index) => (
            <Link
              key={item.url || index}
              href={item.url}
              className="text-sm text-gray-600 hover:text-gray-900 transition-colors"
            >
              {item.label}
            </Link>
          ))}
        </nav>

        {/* SNSリンク */}
        {socialLinks.length > 0 && (
          <div className="flex justify-center gap-4 mb-6">
            {socialLinks.map((link: SocialLinkItem) => {
              // デバイス別の表示クラスを決定
              const visibilityClass = getVisibilityClass(link.showOnDesktop, link.showOnMobile)
              // 両方非表示の場合はスキップ
              if (!link.showOnDesktop && !link.showOnMobile) return null
              return (
                <a
                  key={link.id}
                  href={link.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`text-gray-500 hover:text-gray-700 transition-colors ${visibilityClass}`}
                  aria-label={link.platform}
                >
                  <SocialIcon platform={link.platform} />
                </a>
              )
            })}
          </div>
        )}

        {/* コピーライト */}
        <p className="text-center text-sm text-gray-500">
          {copyrightText}
        </p>
      </div>
    </footer>
  )
}

interface SocialIconProps {
  platform: string
}

function SocialIcon({ platform }: SocialIconProps): ReactElement {
  const iconClass = 'h-5 w-5'

  switch (platform.toLowerCase()) {
    case 'twitter':
    case 'x':
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
        </svg>
      )
    case 'instagram':
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zM12 0C8.741 0 8.333.014 7.053.072 2.695.272.273 2.69.073 7.052.014 8.333 0 8.741 0 12c0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98C8.333 23.986 8.741 24 12 24c3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98C15.668.014 15.259 0 12 0zm0 5.838a6.162 6.162 0 100 12.324 6.162 6.162 0 000-12.324zM12 16a4 4 0 110-8 4 4 0 010 8zm6.406-11.845a1.44 1.44 0 100 2.881 1.44 1.44 0 000-2.881z" />
        </svg>
      )
    case 'facebook':
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
        </svg>
      )
    case 'line':
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M19.365 9.863c.349 0 .63.285.63.631 0 .345-.281.63-.63.63H17.61v1.125h1.755c.349 0 .63.283.63.63 0 .344-.281.629-.63.629h-2.386c-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63h2.386c.349 0 .63.285.63.63 0 .349-.281.63-.63.63H17.61v1.125h1.755zm-3.855 3.016c0 .27-.174.51-.432.596-.064.021-.133.031-.199.031-.211 0-.391-.09-.51-.25l-2.443-3.317v2.94c0 .344-.279.629-.631.629-.346 0-.626-.285-.626-.629V8.108c0-.27.173-.51.43-.595.06-.023.136-.033.194-.033.195 0 .375.104.495.254l2.462 3.33V8.108c0-.345.282-.63.63-.63.345 0 .63.285.63.63v4.771zm-5.741 0c0 .344-.282.629-.631.629-.345 0-.627-.285-.627-.629V8.108c0-.345.282-.63.627-.63.349 0 .631.285.631.63v4.771zm-2.466.629H4.917c-.345 0-.63-.285-.63-.629V8.108c0-.345.285-.63.63-.63.349 0 .63.285.63.63v4.141h1.756c.348 0 .629.283.629.63 0 .344-.281.629-.629.629M24 10.314C24 4.943 18.615.572 12 .572S0 4.943 0 10.314c0 4.811 4.27 8.842 10.035 9.608.391.082.923.258 1.058.59.12.301.079.766.038 1.08l-.164 1.02c-.045.301-.24 1.186 1.049.645 1.291-.539 6.916-4.078 9.436-6.975C23.176 14.393 24 12.458 24 10.314" />
        </svg>
      )
    default:
      return (
        <svg className={iconClass} fill="currentColor" viewBox="0 0 24 24">
          <path d="M12 0C5.373 0 0 5.373 0 12s5.373 12 12 12 12-5.373 12-12S18.627 0 12 0zm0 22c-5.523 0-10-4.477-10-10S6.477 2 12 2s10 4.477 10 10-4.477 10-10 10z" />
        </svg>
      )
  }
}
