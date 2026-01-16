'use client'

/**
 * TopBar
 *
 * モバイル用トップバー
 * ハンバーガーボタンでサイドバーを開閉
 */

import { Menu } from 'lucide-react'
import Link from 'next/link'
import { useAdminLayout } from '@/contexts/admin-layout-context'
import { Button } from '@/components/admin/ui'
import { LogoutButton } from './LogoutButton'

type TopBarProps = {
  token: string
}

export function TopBar({ token }: TopBarProps) {
  const { toggleSidebar, isMobile } = useAdminLayout()

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center justify-between border-b bg-white px-4 shadow-sm lg:px-6">
      {/* 左: ハンバーガー + タイトル */}
      <div className="flex items-center gap-3">
        {isMobile && (
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
        <h1 className="text-lg font-semibold text-gray-900">管理画面</h1>
      </div>

      {/* 右: アクション */}
      <div className="flex items-center gap-4">
        <Link
          href="/"
          target="_blank"
          className="text-sm text-gray-600 hover:text-gray-900 hidden sm:block"
        >
          サイトを表示
        </Link>
        <LogoutButton token={token} />
      </div>
    </header>
  )
}
