'use client'

/**
 * TopBar
 *
 * モバイル用トップバー
 * ハンバーガーボタンでサイドバーを開閉
 * ブランディング表示（ロゴ/サイト名）対応
 */

import { useState } from 'react'
import Image from 'next/image'
import { Menu } from 'lucide-react'
import Link from 'next/link'
import { useAdminLayout } from '@/admin/contexts/admin-layout-context'
import { Button } from '@/admin/components/ui'
import { LogoutButton } from './LogoutButton'

type TopBarProps = {
  token: string
  siteName: string | null
  headerLogoUrl: string | null
  useHeaderLogo: boolean
}

export function TopBar({ token, siteName, headerLogoUrl, useHeaderLogo }: TopBarProps) {
  const { toggleSidebar, isMobile, isFullscreen, hasMounted } = useAdminLayout()
  const [logoError, setLogoError] = useState(false)

  // フルスクリーンモード時はヘッダーを非表示
  if (isFullscreen) return null

  // Hydration対策: マウント前はSSR時と同じ値（isMobile=false）を使用
  const showMobileMenu = hasMounted && isMobile

  const displayName = siteName || '管理画面'

  // ブランディング表示: ロゴまたはテキスト
  const renderBranding = () => {
    // テキスト表示の条件: ロゴ無効 or ロゴURL無し or ロゴ読込失敗
    if (!useHeaderLogo || !headerLogoUrl || logoError) {
      return <span className="text-lg font-semibold text-foreground">{displayName}</span>
    }

    // ロゴ表示
    return (
      <Image
        src={headerLogoUrl}
        alt={displayName}
        width={120}
        height={32}
        className="h-8 w-auto object-contain"
        onError={() => setLogoError(true)}
        priority
      />
    )
  }

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-card px-4 shadow-sm lg:px-6">
      {/* 左: ハンバーガー + ブランディング */}
      <div className="flex items-center gap-3">
        {showMobileMenu && (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={toggleSidebar}
            className="h-9 w-9 p-0"
            aria-label="メニューを開く"
          >
            <Menu className="h-5 w-5" />
          </Button>
        )}
        <Link href="/admin" className="flex items-center">
          {renderBranding()}
        </Link>
      </div>

      {/* 右: アクション */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          target="_blank"
          className="text-sm text-muted-foreground hover:text-foreground transition-colors duration-200 hidden sm:block"
        >
          サイトを表示
        </Link>
        <LogoutButton token={token} />
      </div>
    </header>
  )
}
