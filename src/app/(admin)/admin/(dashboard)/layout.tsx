/**
 * ダッシュボードレイアウト
 *
 * レスポンシブ対応:
 * - デスクトップ (>= 1024px): 固定サイドバー
 * - モバイル/タブレット: ドロワー形式
 *
 * Next.js 16 PPR対応:
 * - 静的シェル: サイドバー、ヘッダー構造
 * - 動的コンテンツ: 認証情報（Suspenseでラップ）
 */

import { Suspense } from 'react'
import { AdminLayoutProvider } from '@/contexts/admin-layout-context'
import { ResponsiveSidebar } from './_components/ResponsiveSidebar'
import { TopBar } from './_components/TopBar'
import { UserInfo, UserInfoSkeleton } from './_components/UserInfo'
import type { ReactElement, ReactNode } from 'react'

const ADMIN_LOGIN_TOKEN = process.env.ADMIN_LOGIN_TOKEN || ''

export default function DashboardLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <AdminLayoutProvider>
      <div className="min-h-screen bg-gray-100">
        {/* レスポンシブサイドバー */}
        <ResponsiveSidebar
          userInfo={
            <Suspense fallback={<UserInfoSkeleton />}>
              <UserInfo />
            </Suspense>
          }
        />

        {/* メインコンテンツエリア */}
        <div className="lg:pl-64 transition-[padding] duration-300">
          {/* トップバー */}
          <TopBar token={ADMIN_LOGIN_TOKEN} />

          {/* コンテンツ */}
          <main className="p-4 lg:p-6">{children}</main>
        </div>
      </div>
    </AdminLayoutProvider>
  )
}
