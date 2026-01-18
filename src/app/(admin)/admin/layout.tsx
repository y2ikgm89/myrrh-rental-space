/**
 * 管理画面共通レイアウト
 *
 * 最小限の共通設定のみ。
 * サイドバーは(dashboard)グループ、認証画面は(auth)グループで個別に管理。
 */

import type { Metadata } from 'next'
import { Toaster } from '@/admin/components/ui'
import type { ReactElement, ReactNode } from 'react'

export const metadata: Metadata = {
  title: {
    default: '管理画面',
    template: '%s | 管理画面',
  },
  robots: {
    index: false,
    follow: false,
  },
}

export default function AdminLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <>
      {children}
      <Toaster />
    </>
  )
}
