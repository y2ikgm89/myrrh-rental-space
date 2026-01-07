/**
 * 公開ページ用レイアウト
 *
 * ヘッダー・フッターを含むレイアウト
 */

import { Header } from '@/components/layouts/Header'
import { Footer } from '@/components/layouts/Footer'

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  )
}
