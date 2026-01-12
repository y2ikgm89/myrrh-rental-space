/**
 * ダッシュボードレイアウト
 *
 * - サイドバーナビゲーション
 * - 認証状態の表示
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: サイドバー、ヘッダー構造
 * - 動的コンテンツ: 認証情報（Suspenseでラップ）
 */

import { Suspense } from 'react'
import Link from 'next/link'
import { getSession } from '@/lib/auth'
import { LogoutButton } from './_components/LogoutButton'
import type { ReactElement, ReactNode } from 'react'

const ADMIN_LOGIN_TOKEN = process.env.ADMIN_LOGIN_TOKEN || ''

const sidebarItems = [
  { label: 'ダッシュボード', href: '/admin', icon: 'dashboard' },
  { label: '予約管理', href: '/admin/reservations', icon: 'calendar' },
  { label: 'スペース管理', href: '/admin/spaces', icon: 'space' },
  { label: 'お問い合わせ', href: '/admin/inquiries', icon: 'mail' },
  { label: 'お知らせ', href: '/admin/news', icon: 'news' },
  { label: 'ブログ', href: '/admin/blog', icon: 'blog' },
  { label: 'ページ管理', href: '/admin/pages', icon: 'page' },
  { label: 'FAQ', href: '/admin/faq', icon: 'faq' },
  { label: '顧客管理', href: '/admin/customers', icon: 'users' },
  { label: '設定', href: '/admin/settings', icon: 'settings' },
]

/**
 * 動的コンテンツ: ユーザー情報
 */
async function UserInfo(): Promise<ReactElement | null> {
  const session = await getSession()

  if (!session?.user) return null

  return (
    <div className="absolute bottom-0 left-0 right-0 border-t border-gray-800 p-4">
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-gray-700 flex items-center justify-center">
          <span className="text-sm font-medium">
            {session.user.name?.[0] ?? session.user.email?.[0] ?? 'U'}
          </span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium truncate">
            {session.user.name ?? 'ユーザー'}
          </p>
          <p className="text-xs text-gray-400 truncate">
            {session.user.email}
          </p>
        </div>
      </div>
    </div>
  )
}

/**
 * ユーザー情報ローディング
 */
function UserInfoLoading(): ReactElement {
  return (
    <div className="absolute bottom-0 left-0 right-0 border-t border-gray-800 p-4">
      <div className="flex items-center gap-3 animate-pulse">
        <div className="h-8 w-8 rounded-full bg-gray-700" />
        <div className="flex-1 space-y-2">
          <div className="h-4 bg-gray-700 rounded w-20" />
          <div className="h-3 bg-gray-700 rounded w-32" />
        </div>
      </div>
    </div>
  )
}

export default async function DashboardLayout({
  children,
}: {
  children: ReactNode
}): Promise<ReactElement> {
  return (
    <div className="min-h-screen bg-gray-100">
      {/* サイドバー */}
      <aside className="fixed inset-y-0 left-0 z-50 w-64 bg-gray-900 text-white">
        {/* ロゴ */}
        <div className="flex h-16 items-center justify-center border-b border-gray-800">
          <Link href="/admin" className="text-xl font-bold">
            Myrrh Admin
          </Link>
        </div>

        {/* ナビゲーション */}
        <nav className="mt-6 px-3">
          <ul className="space-y-1">
            {sidebarItems.map((item) => (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className="flex items-center gap-3 rounded-lg px-3 py-2 text-gray-300 transition-colors hover:bg-gray-800 hover:text-white"
                >
                  <SidebarIcon icon={item.icon} />
                  <span>{item.label}</span>
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        {/* ユーザー情報（動的） */}
        <Suspense fallback={<UserInfoLoading />}>
          <UserInfo />
        </Suspense>
      </aside>

      {/* メインコンテンツ */}
      <main className="pl-64">
        {/* ヘッダー */}
        <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-6 shadow-sm">
          <h1 className="text-lg font-semibold text-gray-900">管理画面</h1>
          <div className="flex items-center gap-4">
            <Link
              href="/"
              target="_blank"
              className="text-sm text-gray-600 hover:text-gray-900"
            >
              サイトを表示
            </Link>
            <LogoutButton token={ADMIN_LOGIN_TOKEN} />
          </div>
        </header>

        {/* コンテンツ */}
        <div className="p-6">{children}</div>
      </main>
    </div>
  )
}

interface SidebarIconProps {
  icon: string
}

function SidebarIcon({ icon }: SidebarIconProps): ReactElement | null {
  const className = 'h-5 w-5'

  switch (icon) {
    case 'dashboard':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
        </svg>
      )
    case 'calendar':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
      )
    case 'space':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
        </svg>
      )
    case 'mail':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
        </svg>
      )
    case 'news':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z" />
        </svg>
      )
    case 'blog':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
        </svg>
      )
    case 'page':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      )
    case 'faq':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.228 9c.549-1.165 2.03-2 3.772-2 2.21 0 4 1.343 4 3 0 1.4-1.278 2.575-3.006 2.907-.542.104-.994.54-.994 1.093m0 3h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      )
    case 'users':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
        </svg>
      )
    case 'settings':
      return (
        <svg className={className} fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      )
    default:
      return null
  }
}
