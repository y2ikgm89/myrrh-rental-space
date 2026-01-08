/**
 * 公開ページ用レイアウト
 *
 * ヘッダー・フッターを含むレイアウト
 */

import { Header } from '@/components/layouts/Header'
import { Footer } from '@/components/layouts/Footer'
import type { ReactElement, ReactNode } from 'react'

export default function PublicLayout({
  children,
}: {
  children: ReactNode
}): ReactElement {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
