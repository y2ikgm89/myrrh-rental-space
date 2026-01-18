/**
 * SettingsLayout
 *
 * 各設定ページの共通レイアウト
 * パンくず、戻るボタン、タイトル
 */

import Link from 'next/link'
import { ArrowLeft } from 'lucide-react'
import { Button } from '@/admin/components/ui'

interface SettingsLayoutProps {
  title: string
  description?: string
  children: React.ReactNode
}

export function SettingsLayout({ title, description, children }: SettingsLayoutProps) {
  return (
    <div className="space-y-6">
      {/* ヘッダー */}
      <div className="flex items-center gap-4">
        <Button asChild variant="ghost" size="icon">
          <Link href="/admin/settings">
            <ArrowLeft className="h-5 w-5" />
            <span className="sr-only">設定に戻る</span>
          </Link>
        </Button>
        <div>
          <h1 className="text-2xl font-bold">{title}</h1>
          {description && (
            <p className="text-muted-foreground">{description}</p>
          )}
        </div>
      </div>

      {/* コンテンツ */}
      <div className="space-y-6">
        {children}
      </div>
    </div>
  )
}
